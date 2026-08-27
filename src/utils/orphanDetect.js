/**
 * orphanDetect — el HUÉRFANO DE CREACIÓN: un componente que este plan creó y
 * que, al terminar la generación, ningún archivo del proyecto importa.
 * Determinista, sin modelo, sin red. MIDE; no repara.
 *
 * POR QUÉ EXISTE
 * --------------
 * Instancia A (Flour & Stone, e279a8be): el plan creó un componente bajo
 * src/components/ y el proyecto final no lo importaba desde ningún sitio. El
 * archivo existía en forge_files, el intent cerró en 'success' y el preview no
 * lo pintaba — porque nadie lo montaba. Invisible por partida doble: invisible
 * en el preview (no está en el árbol) e invisible en la telemetría (no hay
 * error, no hay warning, no hay marca; `modified_files` lo lista igual que a
 * cualquier archivo que sí se usa). La única forma de detectarlo era abrir el
 * proyecto y mirar.
 *
 * El compilador no lo ve: un módulo que nadie importa compila perfectamente. El
 * verify no lo ve: no hay error que reparar. `danglingRefs` cubre la asimetría
 * OPUESTA —alguien referencia lo que ya no existe—, no ésta. Este módulo pone
 * la señal que faltaba, y sólo la señal.
 *
 * QUÉ MIDE, EXACTAMENTE
 * ---------------------
 * Paths que cumplen las CUATRO condiciones a la vez:
 *   1. son `file_path` de un step con `action: "create"` de ESTE plan
 *      (`modify` jamás cuenta: modificar un archivo que ya vivía descolgado no
 *      es un huérfano que este intent haya creado, y `delete` menos aún),
 *   2. caen bajo `src/components/` (fuera de ahí "nadie me importa" es normal:
 *      una página la monta el router por otra vía, un util puede ser el borde
 *      de un flujo),
 *   3. no caen bajo las exclusiones de ruido del bloque de prompt del import
 *      graph — `PROMPT_ROW_EXCLUDED_PREFIXES`, es decir src/components/ui/ y
 *      src/lib/ —, importadas de importGraph.js para que las dos superficies no
 *      puedan desincronizarse,
 *   4. su archivo EXISTE en el mapa final y su conjunto de importadores vía
 *      `buildImportedByMap` está VACÍO.
 *
 * La (4) es dos condiciones en una y las dos importan. "Existe en el mapa
 * final" descarta el archivo que el plan creó y que el propio camino borró
 * después: eso no es un huérfano, es un archivo que no está. Y el conjunto de
 * importadores se calcula con `buildImportedByMap` —reuso, no reimplementación:
 * misma resolución de specifiers que el guard de borrado y que el bloque del
 * Architect, así que "quién importa a quién" significa lo mismo en todo el
 * pipeline.
 *
 * FRONTERA — QUÉ NO ES ESTO
 * -------------------------
 * G-2 NO detecta la variante C, la víctima-ALCANZABLE-DESACTUALIZADA: el
 * componente que sí está importado y montado pero cuyo contenido quedó viejo
 * respecto de lo que el usuario pidió. Esa la cubre G-1. Aquí sólo hay
 * huérfanos DE CREACIÓN: el criterio es topológico —cero importadores—, nunca
 * semántico. Un componente con un solo importador no aparece por muy
 * desactualizado que esté.
 *
 * Y no repara. No hay recableado, no hay warning al usuario, no hay cambio de
 * flujo: sólo el sufijo `[ORPHAN_CREATED:<paths>]` en el user_prompt del intent
 * log. La reparación automática sólo se diseñará si la medición la justifica, y
 * para eso primero hay que poder contarla.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * importGraph.js, planGuard.js y deletionGuard.js. El tipado vive en
 * orphanDetect.d.ts.
 */

import { buildImportedByMap, PROMPT_ROW_EXCLUDED_PREFIXES } from './importGraph.js';
import { normalizePlanPath } from './planGuard.js';

/**
 * El único territorio donde "nadie me importa" es una anomalía. Fuera de
 * src/components/ un archivo sin importadores puede ser perfectamente legítimo
 * (una página que monta el router, la raíz del árbol, un .sql, un .md).
 */
export const ORPHAN_SCOPE_PREFIX = 'src/components/';

/** Sólo estas acciones pueden producir un huérfano DE CREACIÓN. */
const CREATE_ACTION = 'create';

/**
 * Normaliza el mapa final: acepta Map<string,string> (lo que circula por las
 * lanes) o un objeto plano (cómodo en tests). Misma política que importGraph.
 *
 * @param {unknown} files
 * @returns {Map<string, string>}
 */
function asMap(files) {
  if (files instanceof Map) return files;
  if (files !== null && typeof files === 'object') return new Map(Object.entries(files));
  return new Map();
}

/**
 * Paths que ESTE plan declara crear bajo el scope vigilado, normalizados,
 * ordenados y sin duplicados.
 *
 * FAIL-CLOSED. Un plan que no es un array, un step que no es un objeto, una
 * `action` que no es exactamente 'create' o un `file_path` ilegible no aportan
 * nada: sin candidato no hay marca. La dirección segura aquí es la contraria a
 * la de planGuard —allí la duda REPARA, aquí la duda CALLA— porque el coste de
 * un falso positivo es un dato de telemetría mentiroso y el de un falso
 * negativo es un dato que falta.
 *
 * @param {unknown} steps Steps del plan ejecutado (post-trim, post-repair).
 * @returns {string[]}
 */
export function createdComponentPaths(steps) {
  if (!Array.isArray(steps)) return [];

  const out = new Set();
  for (const step of steps) {
    if (step === null || typeof step !== 'object') continue;
    if (step.action !== CREATE_ACTION) continue;
    const path = normalizePlanPath(step.file_path);
    if (path.length === 0) continue;
    if (!path.startsWith(ORPHAN_SCOPE_PREFIX)) continue;
    if (PROMPT_ROW_EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
    out.add(path);
  }
  return [...out].sort();
}

/**
 * Huérfanos de creación de este plan: de los candidatos de
 * `createdComponentPaths`, los que existen en el mapa final y que nadie importa.
 *
 * @param {unknown} steps Steps del plan ejecutado.
 * @param {unknown} finalFiles Mapa FINAL de archivos del proyecto (post-verify).
 * @returns {string[]} Ordenado y sin duplicados. Vacío cuando no hay hallazgos.
 */
export function detectCreatedOrphans(steps, finalFiles) {
  const candidates = createdComponentPaths(steps);
  if (candidates.length === 0) return [];

  const map = asMap(finalFiles);
  // Un candidato que ya no está en el mapa final no es huérfano: es un archivo
  // que el camino borró (un delete posterior del propio plan, un barrido). Se
  // descarta ANTES de construir el grafo para no pagarlo cuando no hace falta.
  const present = candidates.filter((path) => map.has(path));
  if (present.length === 0) return [];

  let importedBy;
  try {
    importedBy = buildImportedByMap(map);
  } catch {
    // Un contenido raro nunca puede tumbar el run, y esto es telemetría: sin
    // señal fiable no inventamos una. Mismo fail-closed que deleteVerdict.
    return [];
  }

  return present.filter((path) => (importedBy.get(path) ?? []).length === 0);
}

/**
 * Sufijo de telemetría con los huérfanos de creación. Va al user_prompt de
 * forge_intent_log — misma gramática que [TARGETS:...], [PLAN_REPAIRED:...],
 * [RESTORED:...] y [TRIMMED:...]: espacio delante, contenido entre corchetes,
 * concatenable sin separador — para que "¿cuántos intents dejan un componente
 * que nadie monta?" sea una query en vez de una inspección manual.
 *
 * @param {Iterable<string>} paths
 * @returns {string} '' cuando no hay hallazgos.
 */
export function orphanCreatedTelemetry(paths) {
  // Fail-closed también en la marca: un argumento no iterable no revienta el
  // cierre del intent, simplemente no deja rastro.
  if (paths === null || paths === undefined) return '';
  if (typeof paths[Symbol.iterator] !== 'function') return '';
  const list = [...paths].filter((p) => typeof p === 'string' && p.length > 0);
  if (list.length === 0) return '';
  return ` [ORPHAN_CREATED:${[...new Set(list)].sort().join(',')}]`;
}
