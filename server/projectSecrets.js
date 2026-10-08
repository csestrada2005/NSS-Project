// ---------------------------------------------------------------------------
// projectSecrets — llaves "como Lovable" (2026-10-08, decisiones de Samuel):
// la llave vive SÓLO en los secretos del servidor del proyecto (Supabase del
// proyecto, Management API); Wyrd no guarda copia y nunca la devuelve. Qué
// llaves "faltan" no sale de una lista fija: sale del CÓDIGO de las funciones
// del proyecto (cada `Deno.env.get('NOMBRE')`), así sirve igual para Stripe,
// Perplexity, Banxico o lo que sea. Las `SUPABASE_*` las pone Supabase solo:
// no se muestran ni se pueden escribir.
// ---------------------------------------------------------------------------

const FUNCTION_FILE_RE = /^supabase\/functions\/([^/]+)\/.+\.(?:ts|js|mjs|tsx)$/;
const ENV_GET_RE = /Deno\.env\.get\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\1\s*\)/g;
const NAME_RE = /^[A-Z][A-Z0-9_]{0,99}$/;
const MAX_VALUE_LENGTH = 8192;

/** Nombre válido para guardar: MAYÚSCULAS_CON_GUIONES y no reservado por Supabase. */
export function isValidSecretName(name) {
  return typeof name === 'string' && NAME_RE.test(name) && !name.startsWith('SUPABASE_');
}

export function isValidSecretValue(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_VALUE_LENGTH;
}

/**
 * Llaves que piden las funciones del proyecto.
 * @param {{ path: string, content: string }[]} files
 * @returns {Map<string, string[]>} nombre → funciones (slug) que la piden
 */
export function requiredSecretsFromFiles(files) {
  const required = new Map();
  for (const f of files ?? []) {
    const m = FUNCTION_FILE_RE.exec(String(f?.path ?? ''));
    if (!m || typeof f.content !== 'string') continue;
    const slug = m[1];
    for (const hit of f.content.matchAll(ENV_GET_RE)) {
      const name = hit[2];
      if (name.startsWith('SUPABASE_')) continue;
      const users = required.get(name) ?? [];
      if (!users.includes(slug)) users.push(slug);
      required.set(name, users);
    }
  }
  return required;
}

/**
 * Estado de cada llave: falta / configurada / configurada sin usar.
 * @param {Map<string, string[]>} required
 * @param {string[]} serverNames nombres que el servidor del proyecto ya tiene
 */
export function secretsStatus(required, serverNames) {
  const onServer = new Set((serverNames ?? []).filter((n) => !String(n).startsWith('SUPABASE_')));
  const rows = [];
  for (const [name, usedBy] of required) {
    rows.push({ name, status: onServer.has(name) ? 'set' : 'missing', usedBy });
  }
  for (const name of onServer) {
    if (!required.has(name)) rows.push({ name, status: 'unused', usedBy: [] });
  }
  const order = { missing: 0, set: 1, unused: 2 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
}

const api = (ref) => `https://api.supabase.com/v1/projects/${ref}/secrets`;

async function managementCall(ref, token, init) {
  const response = await fetch(api(ref), {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    // Nunca se reenvía el cuerpo de la petición (llevaría el valor).
    throw Object.assign(new Error(`Management API ${response.status} — ${raw.slice(0, 200)}`), { status: response.status });
  }
  return response;
}

/** Sólo los NOMBRES (la API devuelve un resumen del valor; aquí se descarta). */
export async function listServerSecretNames(ref, token) {
  const response = await managementCall(ref, token, { method: 'GET' });
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? data.map((s) => s?.name).filter((n) => typeof n === 'string') : [];
}

export async function setServerSecret(ref, token, name, value) {
  await managementCall(ref, token, { method: 'POST', body: JSON.stringify([{ name, value }]) });
}

export async function deleteServerSecret(ref, token, name) {
  await managementCall(ref, token, { method: 'DELETE', body: JSON.stringify([name]) });
}
