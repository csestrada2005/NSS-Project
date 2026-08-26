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
 * EL DIRECTORIO ES PARTE DE LA IDENTIDAD (Cirugía 2.2)
 * -----------------------------------------------------
 * La misma doctrina, un nivel más arriba. El nombre no lo elige el modelo, y
 * resulta que la CARPETA tampoco podía: `supabase/migrations/` no es una
 * convención estética, es el prefijo del que cuelga todo lo que reconoce una
 * migración —el renombrado, la marca [DDL_PROPOSED:], el botón de aprobación y
 * el contexto de schema que se le devuelve al modelo. Un .sql fuera de ahí no
 * es una migración para ninguno de los cuatro.
 *
 * Y el modelo lo elegía libremente: la única regla que nombra el directorio
 * (BACKEND_RULES) vive en dos prompts a los que un intent `database_change`
 * NUNCA llega, porque laneRouting lo manda siempre al plan lane. Un proyecto
 * real escribió `src/db/migrations/…` y toda la cadena se apagó EN SILENCIO:
 * archivo escrito, intent en 'success', ningún botón, ninguna pista.
 *
 * Por eso el directorio se normaliza aquí, en el cliente, igual que el
 * timestamp: el prompt sube la tasa de acierto, esto hace que no importe.
 *
 * Dos reglas que el renombrado respeta:
 *  1. Un solo instante por LOTE. Todos los archivos de un mismo intent se
 *     resuelven contra el mismo `now`; si el lote trae varias migraciones se
 *     separan por segundos crecientes. Sin esto, dos llamadas a Date.now() en
 *     el mismo intent pueden caer en segundos distintos y el orden relativo
 *     depende de la latencia, no del plan.
 *  2. Un preexistente EN SU SITIO no se renombra. Si el path ya existía bajo el
 *     prefijo, el intent lo está MODIFICANDO: renombrarlo crearía un duplicado y
 *     dejaría la migración vieja huérfana con su contenido antiguo.
 *     Un preexistente FUERA DE SITIO sí se mueve, y sólo cuando se pide
 *     normalizar: mover un preexistente bien ubicado es una sorpresa, mover uno
 *     mal ubicado es la reparación. Nadie eligió `src/db/migrations/`; lo
 *     inventó un plan, y ahí el archivo es invisible para los cuatro
 *     consumidores. El caller vacía la fila vieja por el mismo puente que usa
 *     para los borrados del plan.
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
 * ¿Es un archivo SQL, viva donde viva?
 *
 * Distinto de isMigrationPath a propósito: esto es "parece una migración", y
 * aquello es "está donde las migraciones tienen que estar". La diferencia entre
 * los dos es exactamente lo que esta cirugía normaliza.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isSqlPath(path) {
  return typeof path === 'string' && path.toLowerCase().endsWith('.sql');
}

/** Nombre de archivo de un path, sin directorios. */
function baseName(path) {
  const cut = String(path ?? '').lastIndexOf('/');
  return cut === -1 ? String(path ?? '') : String(path).slice(cut + 1);
}

/**
 * El path que un .sql DEBE ocupar: su mismo nombre de archivo, bajo
 * supabase/migrations/. Lo que no es .sql, y lo que ya está en su sitio, sale
 * intacto.
 *
 * Se conserva el nombre del archivo y se tira el resto del directorio: la
 * estructura que el modelo inventó (`src/db/migrations/`, `db/`, `migrations/`)
 * no aporta nada que el prefijo real no diga mejor.
 *
 * @param {string} path
 * @returns {string}
 */
export function normalizeMigrationDir(path) {
  if (!isSqlPath(path)) return path;
  if (path.startsWith(MIGRATIONS_DIR)) return path;
  return `${MIGRATIONS_DIR}${baseName(path)}`;
}

/**
 * Los .sql de un lote que NO viven bajo el prefijo — es decir, los que ningún
 * consumidor de migraciones va a reconocer.
 *
 * Después de normalizar esto tiene que salir VACÍO para todo archivo nuevo. Si
 * devuelve algo, es un .sql que YA existía fuera de su sitio (esos no se mueven:
 * moverlos sería borrar y recrear a espaldas del usuario) y hay que decirlo en
 * vez de dejar el silencio de antes.
 *
 * @param {Iterable<string>} paths
 * @returns {string[]}
 */
export function misplacedMigrations(paths) {
  const out = [];
  for (const path of paths ?? []) {
    if (!isSqlPath(path)) continue;
    if (isMigrationPath(path)) continue;
    if (!out.includes(path)) out.push(path);
  }
  return out;
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
 * Mapa de DESTINOS para un lote de paths persistidos: dónde acaba cada
 * migración, con su directorio y su prefijo temporal ya resueltos.
 *
 * Devuelve SÓLO las entradas que cambian: un path que no es migración, o que ya
 * existía EN SU SITIO, no aparece. El caller resuelve con
 * `targets.get(path) ?? path`, así que un mapa vacío es exactamente "no toques
 * nada".
 *
 * Un origen que YA existía en el proyecto y aparece en el mapa es una
 * RECUPERACIÓN: el caller no sólo escribe el destino, también tiene que retirar
 * la fila vieja, o el .sql queda duplicado y el viejo sigue siendo invisible.
 *
 * `options.normalizeDir` es lo que decide si un .sql que el modelo puso en otro
 * sitio se recoloca bajo supabase/migrations/. Va como opción y no como
 * comportamiento fijo porque quien sabe si este intent produce migraciones es el
 * clasificador, no este módulo: un `.sql` suelto en un intent que no es
 * `database_change` no tiene por qué ser una migración.
 *
 * @param {Iterable<string>} paths   paths que este intent va a persistir
 * @param {Iterable<string>|Map<string, unknown>|Set<string>} existingPaths
 *        paths que YA existen en el proyecto (el mapa ORIGINAL, pre-intent)
 * @param {Date|number} now instante único del lote
 * @param {{ normalizeDir?: boolean }} [options]
 * @returns {Map<string, string>} viejo → nuevo
 */
export function resolveMigrationTargets(paths, existingPaths, now, options) {
  const normalizeDir = options?.normalizeDir === true;

  const taken = new Set();
  if (existingPaths instanceof Map) {
    for (const key of existingPaths.keys()) taken.add(key);
  } else if (existingPaths) {
    for (const key of existingPaths) taken.add(key);
  }

  const base = (now instanceof Date ? now : new Date(now)).getTime();
  const targets = new Map();
  // Destinos ya comprometidos por ESTE lote, cambien o no el path original. Un
  // archivo que ya venía con el nombre correcto también ocupa su hueco: sin
  // contarlo, el siguiente del lote podría aterrizar encima.
  const claimed = new Set();
  let seq = 0;

  for (const path of paths ?? []) {
    // Entran las que ya viven bajo el prefijo, y —sólo si se pide normalizar—
    // cualquier otro .sql.
    if (!isMigrationPath(path) && !(normalizeDir && isSqlPath(path))) continue;
    // "Ya existía" son DOS casos y sólo uno es intocable (C-D'):
    //
    //  - Preexistente EN SU SITIO: este intent lo MODIFICA. Ni se renombra ni se
    //    mueve — duplicaría la migración y dejaría huérfana la vieja con su
    //    contenido antiguo. La regla original, intacta.
    //
    //  - Preexistente FUERA DE SITIO: no es un archivo que alguien eligiera
    //    tener ahí, es el residuo de un plan que se inventó la carpeta, y
    //    ningún consumidor de migraciones lo reconoce — ni el renombrado, ni la
    //    marca [DDL_PROPOSED:], ni el botón de aprobación, ni el contexto de
    //    schema. Antes se le avisaba al usuario y se le pedía que lo recreara a
    //    mano: la máquina detectaba el archivo huérfano y delegaba en la persona
    //    una reparación que sabe hacer. Moverlo NO es una sorpresa, es LA
    //    reparación.
    //
    // Sólo entra por normalizeDir, que es donde ya vive la doctrina: fuera de un
    // intent `database_change` un .sql suelto no tiene por qué ser una migración
    // (el `continue` de arriba ya lo dejó fuera) y aquí no se decide eso.
    if (taken.has(path) && isMigrationPath(path)) continue;

    const fileName = normalizeMigrationDir(path).slice(MIGRATIONS_DIR.length);
    const { slug } = splitStamp(fileName);

    // Un segundo por migración dentro del lote: el orden de `paths` es el orden
    // del plan, y el prefijo debe conservarlo.
    let candidate = `${MIGRATIONS_DIR}${utcStamp(base + seq * 1000)}_${slug}`;
    seq++;
    // Colisión con algo ya presente (o con otro destino de este mismo lote):
    // seguimos avanzando segundos hasta encontrar hueco. Determinista y finito.
    while (taken.has(candidate) || claimed.has(candidate)) {
      candidate = `${MIGRATIONS_DIR}${utcStamp(base + seq * 1000)}_${slug}`;
      seq++;
    }

    claimed.add(candidate);
    if (candidate !== path) targets.set(path, candidate);
  }

  return targets;
}

/**
 * Mapa de renombrados dentro de supabase/migrations/, sin tocar directorios.
 *
 * Es resolveMigrationTargets con la normalización APAGADA: lo que había antes de
 * Cirugía 2.2, conservado porque "renombrar lo que ya está en su sitio" sigue
 * siendo una operación con sentido propio y sus tests la fijan.
 *
 * @param {Iterable<string>} paths
 * @param {Iterable<string>|Map<string, unknown>|Set<string>} existingPaths
 * @param {Date|number} now
 * @returns {Map<string, string>} viejo → nuevo
 */
export function resolveMigrationRenames(paths, existingPaths, now) {
  return resolveMigrationTargets(paths, existingPaths, now, { normalizeDir: false });
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
