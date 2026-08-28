/**
 * planGate — cuándo un plan se PARA para que lo apruebe una persona, decidido
 * de forma determinista y fuera del orquestador.
 *
 * POR QUÉ EXISTE COMO MÓDULO
 * --------------------------
 * Mismo arreglo que laneRouting.js, planTrim.js y deletionGuard.js: plain JS
 * importable por `node --test`, tipado a mano en planGate.d.ts para que el
 * build del browser siga estricto. La decisión de parar un plan es una función
 * pura sobre el array de steps y un booleano; enterrarla en un `if` dentro de
 * AIOrchestrator la vuelve inejercitable sin montar la red.
 *
 * QUÉ ES ESTE GATE, Y QUÉ NO ES
 * -----------------------------
 * Es FRICCIÓN, no seguridad. Su trabajo es enseñar el plan antes de ejecutarlo
 * en los dos casos en que ver el plan cambia la decisión de quien pide:
 *
 *   1. El plan borra algo. Un `action: 'delete'` es la única operación del
 *      Implementer que no tiene deshacer barato dentro del mismo turno.
 *   2. El usuario pidió explícitamente revisar (plan mode).
 *
 * La SEGURIDAD de los deletes ya vive en otro sitio y sigue viviendo ahí:
 * src/utils/deletionGuard.js decide qué paths pueden borrarse y cuáles no, y
 * eso corre pase lo que pase con este gate. Confundir los dos papeles sería
 * caro en la dirección mala: si el gate fuese el control de seguridad, un plan
 * cuyos steps llegan ilegibles tendría que parar por si acaso, y cada respuesta
 * malformada del modelo se convertiría en una pregunta al usuario que él no
 * puede contestar ("¿apruebas este plan?" con el plan en blanco).
 *
 * DE AHÍ LA ASIMETRÍA DEL FAIL-CLOSED
 * -----------------------------------
 * Ante basura —`steps` que no es un array, steps sin `action` legible— el gate
 * NO se activa por sí solo: un plan que no se entiende no es evidencia de que
 * haya un borrado, y el guard de deletes es quien tiene la última palabra sobre
 * lo que se ejecuta. Lo que "fail-closed" protege aquí no es el borrado, es la
 * fricción: no inventamos una pausa a partir de una entrada que no leemos.
 *
 * El toggle es lo contrario y por eso se evalúa PRIMERO: si el usuario pidió
 * plan mode, gatea SIEMPRE — plan vacío, plan basura, plan de un solo step
 * inofensivo. Ahí la petición es explícita y no depende de que sepamos leer el
 * plan; dejarla caer porque el plan salió raro sería ejecutar sin permiso justo
 * en el turno en que se pidió permiso.
 */

/**
 * La única `action` de un step que dispara el gate por sí sola.
 *
 * Los valores del enum los emite el Architect y los consume el Implementer;
 * aquí sólo importa este, y por comparación EXACTA (=== 'delete'): un
 * `endsWith`/`includes` haría que un futuro `soft_delete` o un `undelete`
 * heredasen la pausa sin que nadie lo decidiera.
 */
export const GATED_ACTION = 'delete';

/**
 * ¿Este step, tal como llega, es un borrado?
 *
 * @param {unknown} step
 * @returns {boolean} false ante cualquier basura — un step ilegible no cuenta
 *   como delete: quien decide si ese borrado puede ocurrir es deletionGuard.js,
 *   no este gate.
 */
function isDeleteStep(step) {
  return step !== null && typeof step === 'object' && step.action === GATED_ACTION;
}

/**
 * ¿Hay que parar este plan y enseñárselo al usuario antes de ejecutarlo?
 *
 * ORDEN DE EVALUACIÓN DELIBERADO: el toggle primero. Es lo único que gatea sin
 * mirar el plan, así que un plan ilegible no puede hacerle sombra.
 *
 * `planModeEnabled === true` es comparación estricta, no truthiness: el valor
 * llega de estado de UI y de payloads, y un `'false'` (cadena, no booleano) es
 * truthy. Gatear por eso sería parar todos los turnos de alguien que tiene el
 * modo APAGADO, que es la manera de que una función de fricción se convierta en
 * un bloqueo.
 *
 * @param {unknown} steps Plan del Architect (BuildStep[]) tal como llega.
 * @param {unknown} planModeEnabled Toggle explícito del usuario.
 * @returns {boolean}
 */
export function shouldGatePlan(steps, planModeEnabled) {
  if (planModeEnabled === true) return true;
  if (!Array.isArray(steps)) return false;
  return steps.some(isDeleteStep);
}

/**
 * Sufijo de telemetría del plan rechazado. Va al `user_prompt` de
 * forge_intent_log — misma gramática que [TRIMMED:N→M], [TARGETS:...],
 * [DELETE_REJECTED:...] y [DDL_PROPOSED:...]: espacio delante, contenido entre
 * corchetes.
 *
 * SIN PAYLOAD, a diferencia de [TARGETS:...]. El plan rechazado ya viaja entero
 * en la columna `plan_steps` del mismo log (jsonb, BuildStep[] tal cual), que es
 * donde AIHistoryPanel lo lee. Repetir aquí los paths o los conteos sería la
 * misma información en dos sitios que pueden desincronizarse, y el `user_prompt`
 * es una cadena que se lee a ojo: lo que aporta el sufijo es la MARCA
 * —"este turno terminó en rechazo"— no el contenido.
 *
 * Constante y no función de nada: existe como función igualmente para que el
 * call site importe una marca y no escriba un literal, que es como
 * `[TRIMMED:...]` acabó divergiendo de su tope.
 *
 * @returns {string} Siempre ' [PLAN_REJECTED]'.
 */
export function planRejectedTelemetry() {
  return ' [PLAN_REJECTED]';
}
