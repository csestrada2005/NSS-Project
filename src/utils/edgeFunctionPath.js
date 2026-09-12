/**
 * edgeFunctionPath — un solo sitio para reconocer un archivo de Edge Function
 * y para validar el slug con el que Supabase la registra.
 *
 * POR QUÉ EXISTE
 * ---------------
 * El patrón `path.startsWith('supabase/functions/') && path.endsWith('index.ts')`
 * con `parts.length === 4` vivía duplicado en dos sitios de AIOrchestrator.ts
 * (executeNextStep y runHeavyLane) y ninguno de los dos validaba el slug. Un
 * solo bug en la detección — o en la validación de slug que el servidor exige
 * antes de llamar a la Management API de Supabase — había que arreglarlo dos
 * veces, y las dos podían divergir sin que nada lo avisara.
 *
 * `isValidEdgeFunctionSlug` es la MISMA regla que el endpoint del servidor
 * aplica antes de llamar a la Management API (server/edgeFunctionDeploy.js):
 * sólo `[a-z0-9-]`, máximo 50 caracteres. Vive aquí, no allí, porque el cliente
 * necesita la misma regla para decidir si un path *es* una Edge Function antes
 * de intentar desplegarla — un slug inválido en el path no debería ni
 * detectarse como candidato.
 *
 * Plain JS (no TS) para que sea importable desde `node --test` sin el build
 * del navegador, igual que migrationPath.js y deletionGuard.js. El tipado vive
 * en edgeFunctionPath.d.ts.
 */

/** Prefijo bajo el que viven las Edge Functions de un proyecto generado. */
export const EDGE_FUNCTIONS_DIR = 'supabase/functions/';

/** Un slug válido para la Management API de Supabase: `[a-z0-9-]+`, máximo 50 chars. */
const SLUG_PATTERN = /^[a-z0-9-]{1,50}$/;

/**
 * ¿Es `slug` un nombre de función que la Management API acepta?
 *
 * @param {string} slug
 * @returns {boolean}
 */
export function isValidEdgeFunctionSlug(slug) {
  return typeof slug === 'string' && SLUG_PATTERN.test(slug);
}

/**
 * ¿Es este path el entrypoint de una Edge Function?
 *
 * Exige profundidad EXACTA 4 (`supabase/functions/<slug>/index.ts`): un path
 * más profundo (`supabase/functions/foo/bar/index.ts`) o más superficial
 * (`supabase/functions/index.ts`) no es una función reconocible por Supabase,
 * y un slug con caracteres fuera de `[a-z0-9-]` tampoco lo es —Supabase lo
 * rechazaría en el deploy, así que ni se ofrece como candidato.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isEdgeFunctionEntrypoint(path) {
  if (typeof path !== 'string') return false;
  if (!path.startsWith(EDGE_FUNCTIONS_DIR)) return false;
  if (!path.endsWith('/index.ts')) return false;
  const parts = path.split('/');
  if (parts.length !== 4) return false;
  return isValidEdgeFunctionSlug(parts[2]);
}

/**
 * El slug de una Edge Function a partir de su path, o `null` si el path no
 * califica como entrypoint.
 *
 * @param {string} path
 * @returns {string | null}
 */
export function edgeFunctionSlug(path) {
  return isEdgeFunctionEntrypoint(path) ? path.split('/')[2] : null;
}
