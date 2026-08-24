/**
 * laneRouting — a qué lane puede entrar un intent, decidido de forma
 * DETERMINISTA y fuera del orquestador.
 *
 * POR QUÉ EXISTE
 * --------------
 * AIOrchestrator.processRequest tiene tres puertas de entrada en cascada: fast
 * lane (selección + edición barata), simple lane (edición de un archivo sin
 * Architect) y, si ninguna abre, el plan lane. Las dos primeras se decidían con
 * booleanos escritos inline sobre `intent.risk` y `intent.affected_files`, es
 * decir sobre la SALIDA DEL CLASIFICADOR, que es un LLM y por tanto no es
 * estable entre ejecuciones del mismo prompt.
 *
 * Eso convirtió el destino de `database_change` en una tirada de dados:
 *
 *   - Si el clasificador devolvía risk='medium', el intent caía al plan lane y
 *     la migración se escribía y se ejecutaba (Cirugía 1).
 *   - Si devolvía risk='low' con affected_files<=1 —igual de plausible para un
 *     "añade una tabla de pedidos"— caía al simple lane.
 *
 * Y el simple lane NO PUEDE resolver un database_change: su targeting filtra
 * los candidatos con AIOrchestrator.isSelectableSrcFile, que sólo acepta
 * .ts/.tsx/.js/.jsx bajo `src/`. Una migración vive en `supabase/migrations/`
 * y por construcción jamás entra en ese universo de candidatos. El intent no
 * falla: se queda sin objetivo posible y termina en un clarify absurdo
 * ("¿qué componente del frontend?") o en un "fuera de alcance". Un callejón sin
 * salida determinista, disfrazado de duda.
 *
 * De ahí la regla que fija este módulo: hay tipos de intent cuyo trabajo NO
 * cabe en el universo de archivos que las lanes rápidas saben tocar. Para esos,
 * el plan lane no es la ruta preferida — es la ÚNICA. Y no puede depender del
 * risk que haya salido esa vez.
 */

/**
 * Tipos de intent que SIEMPRE siguen al plan lane, sea cual sea su risk o su
 * número de affected_files.
 *
 * database_change: su entregable es un .sql bajo supabase/migrations/, fuera
 * del universo de candidatos de fast/simple lane (sólo src/**\/*.{ts,tsx,js,jsx}).
 */
export const PLAN_LANE_ONLY_TYPES = Object.freeze(['database_change']);

/** ¿Este intent tiene prohibidas las lanes rápidas por su tipo? */
export function isPlanLaneOnly(intent) {
  return PLAN_LANE_ONLY_TYPES.includes(intent?.type);
}

/** El intent no arrastra patrones obligatorios que exijan el pipeline completo. */
function hasNoRequiredPatterns(intent) {
  return (intent?.requiredPatternIds ?? []).length === 0;
}

/**
 * Gate del FAST LANE — edición dirigida sobre el archivo que la selección ya
 * resolvió. Necesita las tres cosas a la vez: una selección, que el archivo de
 * esa selección exista en el proyecto, y un intent barato.
 *
 * @param {object} args
 * @param {object} args.intent               Intent del clasificador.
 * @param {boolean} args.hasSelection        Hay selectedElement.
 * @param {boolean} args.selectionFileExists selectedElement.filePath existe en files.
 */
export function canEnterFastLane({ intent, hasSelection, selectionFileExists }) {
  if (isPlanLaneOnly(intent)) return false;
  return (
    Boolean(hasSelection) &&
    Boolean(selectionFileExists) &&
    (intent?.type === 'style_change' || intent?.risk === 'low') &&
    hasNoRequiredPatterns(intent)
  );
}

/**
 * Gate del SIMPLE LANE — edición de un archivo sin Architect + Implementer.
 * Depende sólo del intent; el orquestador añade aparte que el proyecto tenga
 * archivos.
 */
export function isSimpleEditIntent(intent) {
  if (isPlanLaneOnly(intent)) return false;
  return (
    (intent?.type === 'style_change' ||
      (intent?.risk === 'low' && (intent?.affected_files ?? []).length <= 1)) &&
    hasNoRequiredPatterns(intent)
  );
}
