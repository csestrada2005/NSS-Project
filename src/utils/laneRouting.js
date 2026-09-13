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

/** Extensiones que caen dentro del universo de candidatos de fast/simple lane. */
const SELECTABLE_SRC_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * ¿Este path cae en el universo que fast/simple lane pueden tocar? Mismo
 * criterio que AIOrchestrator.isSelectableSrcFile: sólo .ts/.tsx/.js/.jsx
 * bajo `src/`.
 */
function isSelectableSrcFile(path) {
  if (typeof path !== 'string') return false;
  if (path.includes('node_modules') || path.includes('dist/') || !path.startsWith('src/')) {
    return false;
  }
  return SELECTABLE_SRC_EXTENSIONS.some(ext => path.endsWith(ext));
}

/**
 * ¿Algún archivo de `affected_files` cae FUERA del universo de fast/simple
 * lane? Si es así, ese trabajo no puede completarse en esas lanes sea cual
 * sea el tipo o risk del intent — el plan lane es la única ruta.
 *
 * Fail-closed: un `affected_files` no-array, o con algún elemento no-string,
 * cuenta como "hay trabajo fuera del universo" antes que arriesgar un falso
 * negativo que mande una migración o una Edge Function a una lane que no
 * puede tocarlas.
 */
function hasOutOfUniverseWork(affectedFiles) {
  if (!Array.isArray(affectedFiles)) return true;
  return affectedFiles.some(path => !isSelectableSrcFile(path));
}

/**
 * ¿El prompt crudo del usuario menciona una Edge Function por su ruta?
 * Cinturón determinista independiente del clasificador: si el texto nombra
 * `supabase/functions/`, el plan lane es obligado sin depender de que el
 * intent lo haya recogido en affected_files.
 */
function promptMentionsEdgeFunction(prompt) {
  return typeof prompt === 'string' && prompt.includes('supabase/functions/');
}

/**
 * ¿Este intent tiene prohibidas las lanes rápidas?
 *
 * @param {object} intent
 * @param {string} [prompt] Texto crudo del usuario — opcional, para el
 *   cinturón determinista de `supabase/functions/` sin romper firmas
 *   existentes.
 *
 * También fuerza el plan lane cuando `intent.needs_server === true`: ese eje
 * es independiente del type (C2-3) y su entregable vive en
 * `supabase/functions/`, fuera del universo de src/ que fast/simple lane saben tocar.
 */
export function isPlanLaneOnly(intent, prompt) {
  if (PLAN_LANE_ONLY_TYPES.includes(intent?.type)) return true;
  if (hasOutOfUniverseWork(intent?.affected_files)) return true;
  if (promptMentionsEdgeFunction(prompt)) return true;
  // needs_server es un eje independiente del type (C2-3): el entregable vive
  // en supabase/functions/, fuera del universo de fast/simple lane. Sin esto,
  // un needs_server con risk='low' y affected_files bajo src/ entraría al
  // simple lane y nunca llegaría al Architect, que es quien sabe escribir la
  // Edge Function.
  if (intent?.needs_server === true) return true;
  return false;
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
 * @param {string} [args.prompt]             Texto crudo del usuario — cinturón `supabase/functions/`.
 */
export function canEnterFastLane({ intent, hasSelection, selectionFileExists, prompt }) {
  if (isPlanLaneOnly(intent, prompt)) return false;
  return (
    Boolean(hasSelection) &&
    Boolean(selectionFileExists) &&
    (intent?.type === 'style_change' || intent?.risk === 'low') &&
    hasNoRequiredPatterns(intent)
  );
}

/**
 * Gate del SIMPLE LANE — edición de un archivo sin Architect + Implementer.
 * Depende del intent y, opcionalmente, del prompt crudo para el cinturón
 * `supabase/functions/`; el orquestador añade aparte que el proyecto tenga
 * archivos.
 *
 * @param {object} intent
 * @param {string} [prompt] Texto crudo del usuario.
 */
export function isSimpleEditIntent(intent, prompt) {
  if (isPlanLaneOnly(intent, prompt)) return false;
  return (
    (intent?.type === 'style_change' ||
      (intent?.risk === 'low' && (intent?.affected_files ?? []).length <= 1)) &&
    hasNoRequiredPatterns(intent)
  );
}
