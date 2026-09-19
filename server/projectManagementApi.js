/**
 * projectManagementApi — lectura server-mediada de tres cosas que hoy vive
 * DESMONTADAS en Panel Cloud (`src/components/settings/db/`) porque su única
 * implementación existente le pedía al NAVEGADOR sacar
 * `SUPABASE_SERVICE_ROLE_KEY` de `forge_secrets` (sin filtrar por
 * `project_id`) y usarla directo como `Authorization: Bearer` contra
 * `api.supabase.com` — una llave de servicio completa, viva, expuesta en la
 * consola del navegador de quien sea que abriera esa pantalla. Además el
 * `ref` del proyecto se sacaba de `VITE_SUPABASE_URL` (el env var de LA
 * PLATAFORMA, no el `supabase_project_ref` del proyecto generado) — el mismo
 * fallback silencioso al proyecto principal que `server/edgeFunctionDeploy.js`
 * ya documenta como el bug que existe para matar.
 *
 * LA LLAVE CORRECTA — NI SIQUIERA ES LA MISMA
 * ---------------------------------------------
 * `api.supabase.com/v1/projects/{ref}/...` es la Management API de Supabase:
 * exige un token de Management API a nivel de CUENTA (`SUPABASE_MANAGEMENT_TOKEN`,
 * ya vive server-side, mismo usado por `edgeFunctionDeploy.js` y el flujo de
 * provisioning), NUNCA la `service_role key` de un proyecto — esa es para
 * hablar con el PostgREST de ESE proyecto, no con la Management API. El
 * código desmontado usaba la llave equivocada Y la exponía al navegador: dos
 * fallas independientes, no una.
 *
 * ENDPOINTS DE LA MANAGEMENT API, VERIFICADOS EN DOC OFICIAL
 * -------------------------------------------------------------
 *  - Listar funciones:  GET /v1/projects/{ref}/functions
 *  - Logs (SQL sobre ClickHouse): GET /v1/projects/{ref}/analytics/endpoints/logs?sql=...
 *    Tablas reales por fuente: postgres_logs, auth_logs, function_edge_logs
 *    (Supabase docs, guía de Logs Explorer). Sin iso_timestamp_start/end,
 *    Supabase por defecto sólo trae el último minuto.
 *  - Uso: GET /v1/projects/{ref}/analytics/endpoints/usage.api-counts — devuelve
 *    conteos de requests por servicio (auth/realtime/rest/storage), NO tamaño
 *    de base de datos ni bandwidth (ver nota abajo).
 *
 * LO QUE NO SE CONSTRUYE AQUÍ, A PROPÓSITO
 * -------------------------------------------
 * El panel desmontado ORIGINAL mostraba "Database Size", "Storage Used",
 * "Bandwidth" leyendo `data.db_size_bytes` / `data.storage_size_bytes` /
 * `data.bandwidth_bytes` de la respuesta — campos que NO existen en ningún
 * endpoint documentado de la Management API (el más cercano,
 * `v1-scrape-project-metrics`, devuelve texto Prometheus, no JSON, y su
 * documentación no especifica nombres de métrica). Esos campos estaban
 * inventados, nunca verificados. Este módulo sólo expone lo que SÍ está
 * documentado (conteos de requests); UsagePanel.tsx se ajustó para mostrar
 * eso en vez de cifras fabricadas.
 */

const MANAGEMENT_API_BASE = 'https://api.supabase.com/v1/projects';

/** Fuente de log pedida por el cliente → tabla real de Logs Explorer. */
export const LOG_SOURCES = {
  postgres: 'postgres_logs',
  auth: 'auth_logs',
  'edge-functions': 'function_edge_logs',
};

/**
 * @param {unknown} source
 * @returns {boolean}
 */
export function isValidLogSource(source) {
  return typeof source === 'string' && Object.prototype.hasOwnProperty.call(LOG_SOURCES, source);
}

/**
 * SQL enviado a la Management API. `source` ya pasó por `isValidLogSource`
 * antes de llegar aquí (enumeración cerrada) — nunca se interpola texto del
 * cliente directo en el SQL, sólo el nombre de tabla que resuelve el mapa.
 *
 * @param {keyof typeof LOG_SOURCES} source
 * @returns {string}
 */
export function buildLogsSql(source) {
  const table = LOG_SOURCES[source];
  return `select id, timestamp, event_message from ${table} order by timestamp desc limit 50`;
}

/**
 * Decisión pura, sin red: ¿hay a qué proyecto consultar? Mismo contrato que
 * `validateEdgeFunctionDeployRequest` — 409 NO_PROJECT_DB, nunca un ref por
 * defecto.
 *
 * @param {{ projectRef: string | null | undefined }} params
 * @returns {{ ok: true } | { ok: false, status: number, code: string, error: string }}
 */
export function validateProjectRefRequest({ projectRef }) {
  if (!projectRef) {
    return { ok: false, status: 409, code: 'NO_PROJECT_DB', error: 'Project database not provisioned' };
  }
  return { ok: true };
}

/**
 * Igual que `validateProjectRefRequest`, más la fuente de log. El error del
 * CLIENTE (400, fuente inválida) se revisa antes que la disponibilidad del
 * proyecto (409) — mismo orden que `validateEdgeFunctionDeployRequest`.
 *
 * @param {{ projectRef: string | null | undefined, source: unknown }} params
 * @returns {{ ok: true } | { ok: false, status: number, code: string, error: string }}
 */
export function validateLogsRequest({ projectRef, source }) {
  if (!isValidLogSource(source)) {
    return { ok: false, status: 400, code: 'INVALID_INPUT', error: 'Invalid log source' };
  }
  return validateProjectRefRequest({ projectRef });
}

/**
 * @param {Response} response
 * @param {string} ref
 * @returns {Promise<never>}
 */
async function throwManagementApiError(response, ref) {
  const raw = await response.text().catch(() => '');
  let detail = raw;
  try {
    const parsed = JSON.parse(raw);
    detail = parsed.message || parsed.error || raw;
  } catch {
    /* raw se queda como está */
  }
  throw Object.assign(
    new Error(`projectManagementApi: Management API ${response.status} — ${detail}`),
    { ref, status: response.status }
  );
}

/**
 * @param {string} ref
 * @param {string} managementToken
 * @returns {Promise<unknown[]>}
 */
export async function fetchProjectEdgeFunctionsList(ref, managementToken) {
  const response = await fetch(`${MANAGEMENT_API_BASE}/${ref}/functions`, {
    headers: { Authorization: `Bearer ${managementToken}` },
  });
  if (!response.ok) await throwManagementApiError(response, ref);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * @param {string} ref
 * @param {string} managementToken
 * @param {keyof typeof LOG_SOURCES} source
 * @returns {Promise<{ result: unknown[], error: unknown }>}
 */
export async function fetchProjectLogs(ref, managementToken, source) {
  const sql = buildLogsSql(source);
  const url = `${MANAGEMENT_API_BASE}/${ref}/analytics/endpoints/logs?sql=${encodeURIComponent(sql)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${managementToken}` } });
  if (!response.ok) await throwManagementApiError(response, ref);
  return await response.json();
}

/**
 * @param {string} ref
 * @param {string} managementToken
 * @returns {Promise<{ result: unknown[], error: unknown }>}
 */
export async function fetchProjectUsage(ref, managementToken) {
  const response = await fetch(`${MANAGEMENT_API_BASE}/${ref}/analytics/endpoints/usage.api-counts`, {
    headers: { Authorization: `Bearer ${managementToken}` },
  });
  if (!response.ok) await throwManagementApiError(response, ref);
  return await response.json();
}
