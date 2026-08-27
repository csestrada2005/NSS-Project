/**
 * planGuard — garantía ESTRUCTURAL de que el plan de un INITIAL BUILD trae un
 * step propio, con su propio file_path, para cada archivo de chrome
 * obligatorio. Sin modelo, sin red.
 *
 * POR QUÉ EXISTE
 * --------------
 * El plan lane decide qué archivos toca escribiendo `file_path` en cada
 * BuildStep, y ese campo lo emite un LLM. En los builds iniciales aparece una
 * patología recurrente —el PLEGADO—: el modelo menciona el header o el footer
 * DENTRO de la descripción de otro step en vez de darles un step propio. Una
 * mención en una descripción no escribe ningún archivo: el Implementer sólo
 * abre `step.file_path` (src/services/Implementer.ts, `files.get(step.file_path)`),
 * así que el chrome se queda en su estado de plantilla y el proyecto sale con
 * el navbar genérico "App Name" y el footer "Your Company".
 *
 * La mitigación por prompt ya se intentó y está medida como fallida. El
 * `initialBuildRule` del Architect prohíbe el plegado desde a246007
 * ("Do NOT fold Header or Footer changes into another step's description") y
 * refuerza la prohibición desde f5e99dc ("must never be consolidated away").
 * Ambos commits son ANCESTROS de las regresiones observadas: las reglas
 * estaban activas, con ese texto exacto, cuando el plegado volvió a ocurrir.
 * Una regla en un prompt es una petición, no una garantía — el mismo
 * razonamiento que ya sostiene `isUndeletablePath` y `deleteVerdict`.
 *
 * DÓNDE ACTÚA
 * -----------
 * Fuera del initial build este módulo NO interviene JAMÁS: el gate lo pone el
 * orquestador con la señal que ya calcula (`isInitialBuild`, del literal
 * "App Name" que el scaffold deja en Header.tsx). En un proyecto ya branded, un
 * plan que no toca el header es sencillamente un plan que no toca el header.
 *
 * TRES ARCHIVOS, SIN EXCEPCIONES
 * ------------------------------
 * El set es incondicional dentro del initial build. Index.tsx entra al set por
 * la misma puerta que Header y Footer: en el primer build sigue siendo la
 * plantilla, así que un `modify` inyectado no puede pisar contenido de usuario
 * —no lo hay todavía—, y un condicional ("sólo si el plan crea secciones")
 * sería una rama más que auditar y una rendija más por la que se escapa el
 * caso que nadie previó.
 *
 * LA INYECCIÓN PUEDE DEJAR EL PLAN EN 9 PASOS, Y ESTÁ BIEN
 * -------------------------------------------------------
 * El Architect declara un máximo de 8 steps y lo aplica con su propio trim
 * (src/services/Architect.ts). Este guard corre DESPUÉS de ese trim, así que
 * nada recorta lo que inyecta: un plan reparado puede quedar en 9 o 10 pasos.
 * Es deliberado. El máximo de 8 es una heurística de coste; la presencia del
 * chrome es una garantía. Y la alternativa —desplazar steps no-layout para
 * hacer sitio— convertiría este guard en un SEGUNDO recortador con criterio
 * propio, cuando el recorte tiene un dueño único que es el trim del Architect.
 * Preferimos un plan completo y algo largo a uno corto y cojo.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * importGraph.js, deletionGuard.js y danglingRefs.js. El tipado vive en
 * planGuard.d.ts.
 */

/**
 * Los tres archivos que un plan de initial build DEBE tocar con un step propio.
 * Orden canónico: es también el orden estable en que se reportan los faltantes
 * y en que se inyectan los steps, para que el mismo plan produzca siempre el
 * mismo resultado.
 */
export const INITIAL_BUILD_REQUIRED_PATHS = Object.freeze([
  'src/components/layout/Header.tsx',
  'src/components/layout/Footer.tsx',
  'src/pages/Index.tsx',
]);

/**
 * Descripción determinista de cada step inyectado.
 *
 * Texto plano en una sola línea, sin saltos ni backticks: es el contrato que el
 * propio system prompt del Architect impone a las descripciones ("All
 * description strings must be plain text only — no newlines, no backticks, no
 * special characters"), y el Implementer las copia literalmente al prompt del
 * step.
 *
 * El contenido es una destilación de la doctrina que ya existe: para Header y
 * Footer, del INITIAL-BUILD LAYOUT RULE del Architect; para Index, de sus
 * ROUTING & ENTRY-POINT RULES. Una sola doctrina, escrita dos veces sólo
 * porque una de ellas tiene que sobrevivir a que el modelo no la siga.
 */
const INJECTED_DESCRIPTIONS = Object.freeze({
  'src/components/layout/Header.tsx':
    'Site header whose navbar reflects the brand name from the design brief, ' +
    'nav links whose anchors and routes point only to sections this plan creates, ' +
    'and the primary CTA, replacing the scaffold placeholder chrome.',
  'src/components/layout/Footer.tsx':
    'Site footer that carries the brand name and tagline from siteInfo in ' +
    'src/data/site.ts, the same anchors and links as this plan navigation contract, ' +
    'and the contact data (address, phone, email, business hours) consumed from ' +
    'siteInfo, never written as literals.',
  'src/pages/Index.tsx':
    'Home page at the route / that imports and renders the section components ' +
    'this plan creates, in the order the design brief sets, so no created ' +
    'component is left unreferenced.',
});

/** Acción de todo step inyectado. Los tres archivos ya existen en el scaffold. */
const INJECTED_ACTION = 'modify';

/**
 * Normaliza un `file_path` de un step para compararlo con el set requerido.
 *
 * Deliberadamente conservadora: separadores de Windows a `/` (mismo criterio
 * que el `isLayoutStep` del trim del Architect), espacios recortados y prefijos
 * `./` o `/` eliminados, porque el mapa de archivos del proyecto sólo conoce
 * rutas relativas sin prefijo. Nada más — normalizar de más haría coincidir
 * paths que el Implementer trataría como distintos, que es el error opuesto y
 * peor.
 *
 * @param {unknown} value
 * @returns {string} '' cuando no hay un path utilizable.
 */
export function normalizePlanPath(value) {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim().replace(/\\/g, '/');
  if (raw.length === 0) return '';
  return raw.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
}

/**
 * Paths del set requerido que NINGÚN step del plan reclama con su file_path.
 *
 * FAIL-CLOSED. Un plan que no es un array, un step que no es un objeto o un
 * `file_path` ilegible NO cubren nada: el archivo cuenta como faltante. La
 * garantía es la presencia del step, así que ante la duda se repara. (El plan
 * vacío no llega hasta aquí en producción: el orquestador lo desvía al heavy
 * lane antes de invocar este guard.)
 *
 * La comparación es por `file_path` y sólo por `file_path`, sin mirar `action`.
 * Vigilar además la acción sería asumir un segundo trabajo —el de decidir qué
 * acciones son legítimas sobre infraestructura— que ya tiene dueño en
 * `isUndeletablePath`, donde los tres paths de este set están cubiertos.
 *
 * @param {unknown} plan Steps del Architect, ya post-trim.
 * @returns {string[]} Faltantes en el orden canónico de INITIAL_BUILD_REQUIRED_PATHS.
 */
export function missingRequiredPaths(plan) {
  const claimed = new Set();
  if (Array.isArray(plan)) {
    for (const step of plan) {
      if (step === null || typeof step !== 'object') continue;
      const path = normalizePlanPath(step.file_path);
      if (path.length > 0) claimed.add(path);
    }
  }
  return INITIAL_BUILD_REQUIRED_PATHS.filter((path) => !claimed.has(path));
}

/**
 * Mayor `order` numérico del plan. 0 si no hay ninguno legible — así el primer
 * step inyectado sobre un plan vacío o ilegible arranca en 1, que es donde el
 * contrato del Architect dice que empieza la numeración.
 *
 * @param {unknown} plan
 * @returns {number}
 */
function maxOrderOf(plan) {
  let max = 0;
  if (!Array.isArray(plan)) return max;
  for (const step of plan) {
    if (step === null || typeof step !== 'object') continue;
    const n = Number(step.order);
    if (Number.isFinite(n) && n > max) max = Math.floor(n);
  }
  return max;
}

/**
 * Plan + los steps deterministas que le faltaban, añadidos al final.
 *
 * No muta el plan de entrada: devuelve un array nuevo cuyos elementos previos
 * son las MISMAS referencias, para que un plan ya completo sobreviva
 * intacto.
 *
 * `order` continúa desde el máximo existente, así que los steps inyectados son
 * los últimos que ejecuta el Implementer (que ordena por `order` antes de
 * recorrer el plan). `requires_steps` va vacío a propósito: inventar una
 * dependencia sobre steps que no hemos escrito nosotros metería el chrome en la
 * cascada de fallos —un step cuya dependencia falla se marca como saltado—, y
 * el chrome es justamente lo que no puede dejar de escribirse.
 *
 * Sólo inyecta paths del set requerido que además sigan ausentes del plan: la
 * llamada es idempotente y nunca duplica un step existente.
 *
 * @param {unknown} plan
 * @param {Iterable<string>} missing
 * @returns {object[]} Plan reparado. Copia intacta cuando no hay nada que inyectar.
 */
export function injectMissingSteps(plan, missing) {
  const base = Array.isArray(plan) ? [...plan] : [];

  const wanted = new Set();
  for (const path of missing ?? []) {
    const normalized = normalizePlanPath(path);
    if (INJECTED_DESCRIPTIONS[normalized] !== undefined) wanted.add(normalized);
  }
  if (wanted.size === 0) return base;

  // Recontraste contra el propio plan: quien llama pudo pasar una lista
  // desactualizada, y un step duplicado escribiría el archivo dos veces.
  const stillMissing = missingRequiredPaths(base).filter((path) => wanted.has(path));
  if (stillMissing.length === 0) return base;

  let order = maxOrderOf(base);
  for (const path of stillMissing) {
    order += 1;
    base.push({
      order,
      description: INJECTED_DESCRIPTIONS[path],
      file_path: path,
      action: INJECTED_ACTION,
      requires_steps: [],
    });
  }
  return base;
}

/**
 * Sufijo de telemetría con los paths que este guard tuvo que inyectar. Va al
 * user_prompt de forge_intent_log — misma gramática que [TARGETS:...],
 * [DELETE_REJECTED:...], [RESTORED:...], [DANGLING_REF:...] y [DDL_PROPOSED:...]:
 * espacio delante, contenido entre corchetes, cadena vacía cuando no hubo nada
 * que reparar, para que el log de siempre no cambie.
 *
 * Ordenado y deduplicado, igual que deletionTargetsTelemetry: la marca tiene
 * que ser comparable entre filas, no reflejar el orden en que se descubrió.
 *
 * @param {Iterable<string>} paths
 * @returns {string} '' cuando no hay paths.
 */
export function planRepairedTelemetry(paths) {
  const list = [...(paths ?? [])].filter((p) => typeof p === 'string' && p.length > 0);
  if (list.length === 0) return '';
  return ` [PLAN_REPAIRED:${[...new Set(list)].sort().join(',')}]`;
}

/**
 * Nota que acompaña al ÚNICO reintento del Architect, nombrando explícitamente
 * los archivos que su plan anterior omitió.
 *
 * Viaja en un parámetro propio de Architect.plan, no concatenada al prompt del
 * usuario: `prompt` es lo que dijo el usuario, y meterle texto del sistema es
 * exactamente la contaminación semántica que el resto de este código evita
 * (las marcas de telemetría, por lo mismo, van al log y no al prompt).
 *
 * @param {Iterable<string>} missing
 * @returns {string} '' cuando no falta nada (no hay reintento que anotar).
 */
export function buildPlanRepairNote(missing) {
  const list = [];
  for (const path of missing ?? []) {
    const normalized = normalizePlanPath(path);
    if (normalized.length > 0 && !list.includes(normalized)) list.push(normalized);
  }
  if (list.length === 0) return '';
  return (
    'PLAN REPAIR — MANDATORY. Your previous plan for this same request omitted a ' +
    'required step for these files: ' + list.join(', ') + '. ' +
    'This is the first build of this project, so each of them MUST get its OWN step, ' +
    'with action "modify" and that exact path as its file_path. A mention inside ' +
    'another step\'s description does not write the file. ' +
    'Return the COMPLETE plan again: the steps you already had, plus the missing ones.'
  );
}
