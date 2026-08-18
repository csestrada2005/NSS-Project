/**
 * deletionGuard — legalidad de un step `delete` medida contra el ORIGINAL.
 *
 * POR QUÉ EXISTE (y por qué el guard anterior no bastaba)
 * ------------------------------------------------------
 * El guard previo (importersBlockingDelete) preguntaba "¿algún superviviente
 * importa esto?" contra el mapa VIVO, en el momento del step. La regla de
 * ORDERING obliga a que el delete dependa de los modify que lo desenganchan, así
 * que para cuando el guard mira, el importador ya llegó sin el import: el propio
 * plan fabrica la evidencia que lo autoriza.
 *
 * El caso real: "Elimina la página Menú" produjo 3 modifies + 3 deletes. Uno de
 * ellos borraba src/components/sections/MenuSection.tsx — la sección que la
 * LANDING renderiza — justificado con "no longer imported by Index.tsx", cierto
 * sólo porque el modify anterior del mismo plan lo había quitado. Circular por
 * construcción: la capa de prompt y la capa de guard verifican consistencia
 * INTERNA del plan, y un plan coherentemente equivocado satisface ambas.
 *
 * La defensa necesita una referencia EXTERNA al plan. Son dos, y ninguna es
 * manipulable por los steps:
 *  (a) deletion_targets — qué NOMBRÓ el usuario para eliminar (Capa 1, emitida
 *      por el Architect junto al plan, expandida aquí de forma determinista).
 *  (b) el grafo de imports de originalFiles — el estado ANTES del intent. El
 *      descableado planificado no altera el veredicto porque no ha ocurrido en
 *      el mapa que se consulta.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * importGraph.js y deterministicRestore.js. El tipado vive en deletionGuard.d.ts.
 */

import { buildImportedByMap, importersOfPath } from './importGraph.js';

/** Motivo del rechazo: ni lo nombró el usuario, ni está huérfano en el original. */
export const NOT_TARGETED_STILL_IMPORTED = 'not_targeted_still_imported';

/**
 * Normaliza el mapa de archivos: acepta Map<string,string> (lo que circula por
 * las lanes) o un objeto plano (cómodo en tests).
 *
 * @param {Map<string,string>|Record<string,string>} files
 * @returns {Map<string,string>}
 */
function asMap(files) {
  if (files instanceof Map) return files;
  return new Map(Object.entries(files ?? {}));
}

/**
 * Semillas + huérfanas EXCLUSIVAS PRE-PLAN, en cierre transitivo.
 *
 * Una huérfana exclusiva es un archivo cuyos importadores EN EL ORIGINAL están
 * todos dentro del conjunto: al irse las semillas nadie lo importa, así que se
 * va con ellas. Se calcula aquí, no se acepta del modelo: la expansión es la
 * parte verificable, y limitarla al grafo acota el radio de un target erróneo.
 *
 * Para "Elimina la página Menú" con semilla [src/pages/Menu.tsx]:
 * MenuCategorySection.tsx entra (sólo Menu.tsx lo importaba); MenuSection.tsx
 * NO entra (lo importa src/pages/Index.tsx, que sobrevive al plan).
 *
 * @param {Iterable<string>} seeds        Paths que la petición del usuario nombra.
 * @param {Map<string,string>|Record<string,string>} originalFiles Mapa PRE-plan.
 * @returns {Set<string>} Semillas válidas (existen en el original) + expansión.
 */
export function expandDeletionTargets(seeds, originalFiles) {
  const map = asMap(originalFiles);
  const targets = new Set();
  for (const seed of seeds ?? []) {
    if (typeof seed !== 'string') continue;
    const path = seed.trim();
    // Una semilla que no existe en el original no puede autorizar nada: o el
    // modelo la inventó, o el plan la crea (y crear no es borrar).
    if (path.length > 0 && map.has(path)) targets.add(path);
  }
  if (targets.size === 0) return targets;

  const importedBy = buildImportedByMap(map);
  // Punto fijo: cada pasada puede dejar huérfano a un archivo de segundo nivel
  // (la sección que sólo importaba la sección que acaba de entrar).
  let grew = true;
  while (grew) {
    grew = false;
    for (const [path, importers] of importedBy) {
      if (targets.has(path)) continue;
      if (!Array.isArray(importers) || importers.length === 0) continue;
      if (importers.every((i) => targets.has(i))) {
        targets.add(path);
        grew = true;
      }
    }
  }
  return targets;
}

/**
 * ¿Es legal ejecutar este step `delete`?
 *
 * Legal si (a) el path está en deletion_targets — el usuario lo nombró (o es
 * huérfana exclusiva pre-plan de algo que nombró) — O (b) en originalFiles
 * ningún superviviente del plan lo importa. Los supervivientes son el original
 * menos `plannedDeletes`, que el llamador va reduciendo a medida que rechaza
 * deletes: un archivo que se queda vuelve a contar como importador vivo.
 *
 * Se evalúa contra el ORIGINAL a propósito. Un plan que desconecta y luego borra
 * ya no puede autorizarse a sí mismo: en el mapa que se consulta, el import
 * sigue ahí.
 *
 * @param {{
 *   path: string,
 *   originalFiles: Map<string,string>|Record<string,string>,
 *   plannedDeletes?: Iterable<string>,
 *   deletionTargets?: Set<string>|Iterable<string>,
 * }} input
 * @returns {{ allowed: boolean, targeted: boolean, importers: string[], reason: string|null }}
 */
export function deleteVerdict(input) {
  const { path, originalFiles, plannedDeletes = [], deletionTargets = [] } = input ?? {};
  const targets = deletionTargets instanceof Set ? deletionTargets : new Set(deletionTargets);

  if (targets.has(path)) {
    return { allowed: true, targeted: true, importers: [], reason: null };
  }

  let importers;
  try {
    importers = importersOfPath(path, asMap(originalFiles), { ignorePaths: plannedDeletes });
  } catch {
    // Un contenido raro nunca puede tumbar el run. Sin señal fiable no
    // bloqueamos: el guard de infraestructura sigue en pie por su cuenta.
    return { allowed: true, targeted: false, importers: [], reason: null };
  }

  if (importers.length === 0) {
    return { allowed: true, targeted: false, importers: [], reason: null };
  }
  return {
    allowed: false,
    targeted: false,
    importers,
    reason: NOT_TARGETED_STILL_IMPORTED,
  };
}

/**
 * Sufijo de telemetría con lo que el usuario nombró para borrar. Va al
 * user_prompt de forge_intent_log — mismo patrón que [PARTIAL:...],
 * [DELETE_REJECTED:...] y [RESTORED:...] — para que cada delete quede auditable
 * contra su autorización y no sólo contra el veredicto.
 *
 * @param {Iterable<string>} targets
 * @returns {string} '' cuando no hay targets.
 */
export function deletionTargetsTelemetry(targets) {
  const list = [...(targets ?? [])].filter((p) => typeof p === 'string' && p.length > 0);
  if (list.length === 0) return '';
  return ` [TARGETS:${[...new Set(list)].sort().join(',')}]`;
}
