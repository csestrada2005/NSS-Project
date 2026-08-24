/**
 * migrationPath — el NOMBRE de una migración es su IDENTIDAD, y el modelo no
 * puede ser quien lo elige.
 *
 * EL PROBLEMA
 * -----------
 * El LLM emite siempre `supabase/migrations/20240101000000_<algo>.sql`. Es el
 * ejemplo que ve en cualquier documentación de Supabase y lo copia literal, de
 * modo que la segunda migración que genera un proyecto colisiona con la primera:
 * mismo prefijo, mismo orden aparente, y en forge_files la clave es
 * (project_id, path) — la segunda PISA a la primera. No es un detalle cosmético:
 * el prefijo temporal es lo que ordena una migración respecto de las demás, así
 * que dos nombres iguales son dos identidades fundidas en una.
 *
 * LA SOLUCIÓN, Y POR QUÉ NO SE LE PIDE AL MODELO
 * ----------------------------------------------
 * Se renombra en el CLIENTE, de forma determinista, al instante UTC real
 * (YYYYMMDDHHMMSS). Pedirle al modelo "usa la fecha de hoy" reintroduce el
 * mismo fallo por otra vía: no sabe qué hora es, y una alucinación de fecha es
 * indistinguible de una fecha correcta hasta que colisiona.
 *
 * Dos reglas que el renombrado respeta:
 *  1. Un solo instante por LOTE. Todos los archivos de un mismo intent se
 *     resuelven contra el mismo `now`; si el lote trae varias migraciones se
 *     separan por segundos crecientes. Sin esto, dos llamadas a Date.now() en
 *     el mismo intent pueden caer en segundos distintos y el orden relativo
 *     depende de la latencia, no del plan.
 *  2. Sólo se renombra lo NUEVO. Si el path ya existía en el proyecto, el
 *     intent lo está MODIFICANDO: renombrarlo crearía un duplicado y dejaría la
 *     migración vieja huérfana con su contenido antiguo.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * deletionGuard.js y danglingRefs.js. El tipado vive en migrationPath.d.ts.
 */

/** Prefijo bajo el que viven las migraciones de un proyecto generado. */
export const MIGRATIONS_DIR = 'supabase/migrations/';

/**
 * ¿Es este path un archivo de migración?
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationPath(path) {
  return typeof path === 'string'
    && path.startsWith(MIGRATIONS_DIR)
    && path.toLowerCase().endsWith('.sql');
}

/**
 * Instante UTC en el formato de prefijo de Supabase: YYYYMMDDHHMMSS.
 *
 * @param {Date|number} when
 * @returns {string}
 */
export function utcStamp(when) {
  const d = when instanceof Date ? when : new Date(when);
  const p = (n, width = 2) => String(n).padStart(width, '0');
  return (
    p(d.getUTCFullYear(), 4) +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds())
  );
}

/**
 * Separa el nombre de archivo en (prefijo temporal, resto). Si no lleva prefijo
 * de 14 dígitos, el resto es el nombre entero: una migración sin prefijo
 * también necesita uno.
 *
 * @param {string} fileName
 * @returns {{ stamp: string | null, slug: string }}
 */
function splitStamp(fileName) {
  const m = /^(\d{14})_(.*)$/.exec(fileName);
  if (!m) return { stamp: null, slug: fileName };
  return { stamp: m[1], slug: m[2] };
}

/**
 * Mapa de renombrados para un lote de paths persistidos.
 *
 * Devuelve SÓLO las entradas que cambian: un path que no es migración, o que ya
 * existía en el proyecto, no aparece. El caller resuelve con
 * `renames.get(path) ?? path`, así que un mapa vacío es exactamente "no toques
 * nada".
 *
 * @param {Iterable<string>} paths   paths que este intent va a persistir
 * @param {Iterable<string>|Map<string, unknown>|Set<string>} existingPaths
 *        paths que YA existen en el proyecto (el mapa ORIGINAL, pre-intent)
 * @param {Date|number} now instante único del lote
 * @returns {Map<string, string>} viejo → nuevo
 */
export function resolveMigrationRenames(paths, existingPaths, now) {
  const taken = new Set();
  if (existingPaths instanceof Map) {
    for (const key of existingPaths.keys()) taken.add(key);
  } else if (existingPaths) {
    for (const key of existingPaths) taken.add(key);
  }

  const base = (now instanceof Date ? now : new Date(now)).getTime();
  const renames = new Map();
  let seq = 0;

  for (const path of paths ?? []) {
    if (!isMigrationPath(path)) continue;
    // Ya existía: este intent lo MODIFICA. Renombrarlo duplicaría la migración.
    if (taken.has(path)) continue;

    const fileName = path.slice(MIGRATIONS_DIR.length);
    const { slug } = splitStamp(fileName);

    // Un segundo por migración dentro del lote: el orden de `paths` es el orden
    // del plan, y el prefijo debe conservarlo.
    let candidate = `${MIGRATIONS_DIR}${utcStamp(base + seq * 1000)}_${slug}`;
    seq++;
    // Colisión con algo ya presente (o con otro renombrado de este mismo lote):
    // seguimos avanzando segundos hasta encontrar hueco. Determinista y finito.
    while (taken.has(candidate) || [...renames.values()].includes(candidate)) {
      candidate = `${MIGRATIONS_DIR}${utcStamp(base + seq * 1000)}_${slug}`;
      seq++;
    }

    if (candidate !== path) renames.set(path, candidate);
  }

  return renames;
}

/**
 * Sufijo de telemetría para forge_intent_log: qué migraciones quedaron
 * PROPUESTAS por este intent. Mismo patrón que [PARTIAL:...],
 * [DELETE_REJECTED:...], [RESTORED:...] y [DANGLING_REF:...] — sufijo en el
 * prompt, sin tocar columnas ni enums. Cadena vacía cuando no hay ninguna, así
 * que el log de siempre no cambia.
 *
 * PROPUESTAS, no aplicadas: la generación jamás toca la base de datos. La marca
 * dice "aquí hay DDL esperando aprobación humana", que es justo lo que antes no
 * dejaba rastro alguno — el intent cerraba en 'success' con el archivo escrito
 * y nada indicaba que la base seguía sin cambiar.
 *
 * @param {Iterable<string>} paths
 * @returns {string}
 */
export function ddlProposedTelemetry(paths) {
  const found = [];
  for (const path of paths ?? []) {
    if (isMigrationPath(path) && !found.includes(path)) found.push(path);
  }
  if (found.length === 0) return '';
  return ` [DDL_PROPOSED:${found.join(',')}]`;
}
