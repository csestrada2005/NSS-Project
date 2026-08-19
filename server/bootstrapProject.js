/**
 * bootstrapProject — instala el contrato SQL mínimo en un proyecto Supabase
 * RECIÉN GENERADO por Wyrd Forge.
 *
 * ============================ AVISO DE SEGURIDAD ============================
 * exec_sql JAMÁS debe instalarse en el proyecto Supabase PRINCIPAL de Wyrd.
 * Es una función `security definer` que ejecuta SQL arbitrario: en el proyecto
 * principal equivaldría a entregar la base de datos de la plataforma entera.
 * Su único destino legítimo son los proyectos GENERADOS (los que crea
 * /api/db/provision/:projectId), donde la base de datos pertenece por completo
 * al proyecto del usuario y el único que puede invocarla es el service_role
 * que Wyrd guarda cifrado.
 *
 * Por eso este DDL NO vive en supabase/migrations/ (ese directorio se aplica al
 * proyecto principal) y se envía por Management API contra un `ref` concreto.
 * ===========================================================================
 */

/**
 * DDL del contrato. Idempotente: `create or replace` reemplaza el cuerpo en una
 * segunda pasada y los revoke/grant son declarativos.
 *
 * Opción (a): el parámetro se llama `query` porque así lo pasan TODOS los
 * llamadores ya en producción — server.js (/api/db/:projectId/query),
 * SQLEditor.tsx y SupabaseService.ts invocan rpc('exec_sql', { query: ... }).
 * Confirmado empíricamente contra producción: PostgREST devolvía
 * PGRST202 "Searched for the function public.exec_sql with parameter query".
 * El format() interno usa esa misma variable.
 */
export const EXEC_SQL_DDL = `
create or replace function public.exec_sql(query text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $exec_sql$
declare
  result jsonb;
begin
  execute format('select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) from (%s) t', query)
    into result;
  return coalesce(result, '[]'::jsonb);
end;
$exec_sql$;

revoke all on function public.exec_sql(text) from public;
revoke all on function public.exec_sql(text) from anon;
revoke all on function public.exec_sql(text) from authenticated;
grant execute on function public.exec_sql(text) to service_role;
`;

/**
 * Ejecuta el DDL contra el proyecto `ref` vía Management API.
 *
 * Contrato de error: si algo falla LANZA. Nunca resuelve en silencio, para que
 * el llamador no pueda responder 200 con un fallo escondido en el body.
 * El Error lleva:
 *   - err.message  → el mensaje COMPLETO de la Management API (para el log
 *                    server-side; NO debe viajar al cliente tal cual).
 *   - err.ref      → el ref del proyecto afectado.
 *   - err.status   → el status HTTP de la Management API, si lo hubo.
 *
 * Nunca borra el proyecto: un bootstrap fallido deja el proyecto vivo y
 * reintentables (ver POST /api/admin/bootstrap-db/:projectRef).
 *
 * @param {string} ref             Ref del proyecto Supabase generado.
 * @param {string} managementToken Token de la Supabase Management API.
 * @returns {Promise<void>}
 */
export async function bootstrapProject(ref, managementToken) {
  if (!ref) throw Object.assign(new Error('bootstrapProject: missing project ref'), { ref: null });
  if (!managementToken) {
    throw Object.assign(new Error('bootstrapProject: missing Supabase management token'), { ref });
  }

  let response;
  try {
    response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managementToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: EXEC_SQL_DDL }),
    });
  } catch (err) {
    throw Object.assign(new Error(`bootstrapProject: network failure — ${err.message}`), { ref });
  }

  if (!response.ok) {
    // El body puede no ser JSON (502/504 de infra devuelven HTML o texto).
    const raw = await response.text().catch(() => '');
    let detail = raw;
    try {
      const parsed = JSON.parse(raw);
      detail = parsed.message || parsed.error || raw;
    } catch {
      /* raw se queda como está */
    }
    throw Object.assign(
      new Error(`bootstrapProject: Management API ${response.status} — ${detail}`),
      { ref, status: response.status }
    );
  }
}
