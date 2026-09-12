/**
 * edgeFunctionDeploy — despliegue REAL de una Edge Function generada, contra
 * la Supabase DEL PROYECTO GENERADO, nunca la principal de Wyrd/NEBU.
 *
 * ============================ AVISO DE SEGURIDAD ============================
 * El `ref` SIEMPRE sale de `forge_projects.supabase_project_ref` del proyecto
 * pedido. Si esa columna es null o vacía, la respuesta es 409 (NO_PROJECT_DB):
 * JAMÁS se cae a VITE_SUPABASE_URL, a un ref por defecto, ni al proyecto
 * principal. Ese fallback silencioso es exactamente la vulnerabilidad que este
 * endpoint existe para cerrar (ver EdgeFunctionsPanel.tsx, que sí incurre en
 * ella hoy y por eso sigue desmontado).
 * ===========================================================================
 *
 * Contrato de la API de Supabase (Management API, verificado en doc oficial):
 *   POST https://api.supabase.com/v1/projects/{ref}/functions/deploy?slug={slug}
 *   Authorization: Bearer <management token>
 *   multipart/form-data: metadata={"entrypoint_path":"index.ts","name":slug}, file=<index.ts>
 * Supabase empaqueta el ESZip de su lado — no se bundlea nada aquí. Crea si el
 * slug no existe, actualiza si existe. 201 en éxito.
 */

import { isValidEdgeFunctionSlug } from '../src/utils/edgeFunctionPath.js';

export { isValidEdgeFunctionSlug };

/**
 * Decisión pura del endpoint, separada de Express y de supabaseAdmin para que
 * sea testable con `node --test` sin un servidor real ni una Supabase real:
 * dado el slug/código pedidos y el `supabase_project_ref` ya leído de
 * `forge_projects`, dice si el request puede seguir o con qué error corta.
 *
 * El orden importa: un slug inválido es un error del CLIENTE (400) y se
 * revisa antes que la disponibilidad del proyecto: un slug malformado sigue
 * siendo inválido tenga o no el proyecto su base provisionada.
 *
 * @param {{ slug: unknown, code: unknown, projectRef: string | null | undefined }} params
 * @returns {{ ok: true } | { ok: false, status: number, code: string, error: string }}
 */
export function validateEdgeFunctionDeployRequest({ slug, code, projectRef }) {
  if (!isValidEdgeFunctionSlug(slug) || typeof code !== 'string') {
    return { ok: false, status: 400, code: 'INVALID_INPUT', error: 'Invalid slug or code' };
  }
  // REGLA DURA: sin ref no hay a qué desplegar. Nunca se sustituye por un ref
  // por defecto — eso es la vulnerabilidad que este endpoint cierra.
  if (!projectRef) {
    return { ok: false, status: 409, code: 'NO_PROJECT_DB', error: 'Project database not provisioned' };
  }
  return { ok: true };
}

/**
 * Envía el `index.ts` de una Edge Function al proyecto `ref` vía Management
 * API, exactamente el mismo contrato de error que
 * bootstrapProject.sendManagementQuery: si algo falla LANZA, y el Error lleva
 * `ref`, `slug` y — si la Management API respondió — `status`.
 *
 * @param {string} ref             Ref del proyecto Supabase GENERADO.
 * @param {string} managementToken Token de la Supabase Management API.
 * @param {string} slug            Nombre de la función. Ya validado por el caller.
 * @param {string} code            Contenido literal de index.ts.
 * @returns {Promise<void>}
 */
export async function deployEdgeFunctionViaManagement(ref, managementToken, slug, code) {
  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify({ entrypoint_path: 'index.ts', name: slug })], { type: 'application/json' })
  );
  form.append('file', new Blob([code], { type: 'text/plain' }), 'index.ts');

  let response;
  try {
    response = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/functions/deploy?slug=${encodeURIComponent(slug)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${managementToken}` },
        body: form,
      }
    );
  } catch (err) {
    throw Object.assign(new Error(`edgeFunctionDeploy: network failure — ${err.message}`), { ref, slug });
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
      new Error(`edgeFunctionDeploy: Management API ${response.status} — ${detail}`),
      { ref, slug, status: response.status }
    );
  }
}
