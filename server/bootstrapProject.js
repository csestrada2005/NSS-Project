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
 *
 * Dos caminos, no uno:
 *   1. El format() envuelve la consulta en un subselect y agrega las filas a
 *      jsonb. Es el camino de SELECT — el que alimentan /query y /schema.
 *   2. Un statement que NO devuelve filas (DDL, o DML sin RETURNING) no cabe
 *      dentro de ese subselect y revienta al envolverlo. La rama `exception
 *      when others` lo vuelve a ejecutar directo y devuelve '[]'::jsonb.
 *      Un error de verdad (sintaxis, permisos) se vuelve a levantar en ese
 *      `execute query` y sale a la superficie tal cual: la rama no traga
 *      errores, solo reintenta sin el envoltorio.
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
  query := regexp_replace(query, '[;\\s]+$', '');
  execute format('select coalesce(jsonb_agg(row_to_json(t)), ''[]''::jsonb) from (%s) t', query)
    into result;
  return coalesce(result, '[]'::jsonb);
exception
  when others then
    -- El statement no devuelve filas: ejecutarlo directo, sin envoltorio.
    execute query;
    return '[]'::jsonb;
end;
$exec_sql$;

revoke all on function public.exec_sql(text) from public;
revoke all on function public.exec_sql(text) from anon;
revoke all on function public.exec_sql(text) from authenticated;
grant execute on function public.exec_sql(text) to service_role;
`;

/**
 * DDL del event trigger que fuerza RLS en toda tabla nueva creada en el
 * proyecto generado. Es un barrido de cobertura, no el contrato mínimo:
 * un proyecto sin este trigger sigue siendo usable (exec_sql ya está
 * instalado), por eso se envía en un segundo request separado del de
 * EXEC_SQL_DDL — ver bootstrapProject().
 *
 * Ambas ramas `exception when others then null;` son deliberadas: ni un
 * fallo de ALTER TABLE (rama interna, por tabla) ni un fallo del propio
 * event trigger (rama externa) pueden propagar y revertir el CREATE TABLE
 * que lo disparó.
 */
export const RLS_TRIGGER_DDL = `
create or replace function public.wyrd_force_rls()
returns event_trigger
language plpgsql
security definer
set search_path = public
as $wyrd_force_rls$
declare obj record;
begin
  for obj in select * from pg_event_trigger_ddl_commands()
  loop
    if obj.command_tag = 'CREATE TABLE' and obj.schema_name = 'public' then
      begin
        execute format('alter table %s enable row level security', obj.object_identity);
      exception when others then
        null;
      end;
    end if;
  end loop;
exception when others then
  null;
end;
$wyrd_force_rls$;

drop event trigger if exists wyrd_force_rls_trigger;

create event trigger wyrd_force_rls_trigger
on ddl_command_end
when tag in ('CREATE TABLE')
execute function public.wyrd_force_rls();
`;

/**
 * Envía un statement SQL al proyecto `ref` vía Management API.
 *
 * Contrato de error: si algo falla LANZA. El Error lleva:
 *   - err.message  → el mensaje COMPLETO de la Management API (para el log
 *                    server-side; NO debe viajar al cliente tal cual).
 *   - err.ref      → el ref del proyecto afectado.
 *   - err.status   → el status HTTP de la Management API, si lo hubo.
 *
 * @param {string} ref             Ref del proyecto Supabase generado.
 * @param {string} managementToken Token de la Supabase Management API.
 * @param {string} sql             Statement a ejecutar.
 * @returns {Promise<void>}
 */
async function sendManagementQuery(ref, managementToken, sql) {
  let response;
  try {
    response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managementToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
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

/**
 * Instala el contrato SQL en el proyecto `ref` vía Management API, en dos
 * envíos SEPARADOS y en este orden:
 *   a) EXEC_SQL_DDL     — el contrato mínimo. Si falla, LANZA: sin esto el
 *                          proyecto es inutilizable.
 *   b) RLS_TRIGGER_DDL  — barrido de cobertura. Si falla, NO lanza: el
 *                          proyecto ya es usable con (a) instalado, así que
 *                          se loguea y bootstrapProject resuelve normal.
 *
 * Nunca borra el proyecto: un bootstrap fallido deja el proyecto vivo y
 * reintentable (ver POST /api/admin/bootstrap-db/:projectRef).
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

  await sendManagementQuery(ref, managementToken, EXEC_SQL_DDL);

  try {
    await sendManagementQuery(ref, managementToken, RLS_TRIGGER_DDL);
  } catch (err) {
    console.error(`[RLS_TRIGGER_FAILED:${ref}] ${err.message}`);
  }
}
