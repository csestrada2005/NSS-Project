/**
 * planTrim — el RECORTE del plan del Architect: presupuesto de steps, criterio
 * de corte y su telemetría. Sin modelo, sin red.
 *
 * POR QUÉ EXISTE COMO MÓDULO
 * --------------------------
 * El recorte vivía embebido en `Architect.plan` (src/services/Architect.ts),
 * dentro del mismo `try` que hace la llamada HTTP, así que no había forma de
 * ejercitarlo desde `node --test` sin montar la red. Extraído aquí es una
 * función pura sobre un array, con el mismo arreglo que planGuard.js,
 * deletionGuard.js e importGraph.js: plain JS importable por los tests, tipado
 * a mano en planTrim.d.ts para que el build del browser siga estricto.
 *
 * QUÉ ESTABA MAL EN EL RECORTE ANTERIOR (tres cosas)
 * -------------------------------------------------
 * 1. CORTABA POR POSICIÓN DE ARRAY. `nonLayoutSteps.slice(0, room)` conserva
 *    los primeros del array tal como los emitió el modelo. Pero el orden de
 *    ejecución NO es el del array: el Implementer ordena por `order`
 *    (src/services/Implementer.ts, `[...plan].sort((a,b) => a.order - b.order)`)
 *    y ese sort vive AGUAS ABAJO del trim. Un plan cuyo array llega
 *    desordenado —el modelo emite el step 9 en la posición 2— perdía steps
 *    tempranos y conservaba tardíos. El campo que decide qué se ejecuta antes
 *    tiene que ser el mismo que decide qué sobrevive: `order`.
 *
 * 2. PROTEGÍA DOS ARCHIVOS DE CUATRO. El set era Header.tsx y Footer.tsx. Pero
 *    la garantía estructural del initial build (G-1, src/utils/planGuard.js)
 *    exige TRES archivos —Header, Footer e Index— y `src/App.tsx` es el router:
 *    un plan que crea páginas y pierde el step de App.tsx las crea sin ruta.
 *    Un trim que se come el step de Index deja al planGuard reinyectándolo
 *    después, es decir, dos módulos peleándose por el mismo archivo.
 *
 * 3. SU TELEMETRÍA MORÍA EN console.warn. El único rastro persistente de un
 *    recorte era... ninguno: un `console.warn` en el navegador y un warning
 *    efímero en la respuesta. Nada en forge_intent_log, así que "¿cuántos
 *    intents se recortan?" no era una pregunta contestable. Ahora hay marca:
 *    `[TRIMMED:N→M]`, misma gramática que [TARGETS:...] y [PLAN_REPAIRED:...].
 *
 * LA GARANTÍA GANA AL PRESUPUESTO
 * -------------------------------
 * Si los protegidos por sí solos superan el tope, sobreviven TODOS y el plan
 * sale con más de TRIM_MAX_STEPS steps. Misma doctrina que G-1, que ya acepta
 * dejar el plan en 9 o 10 pasos con tal de no perder el chrome: el tope es una
 * heurística de coste, la presencia de los archivos protegidos es una garantía.
 * Un recorte que sacrifica una garantía para respetar una heurística tiene las
 * prioridades invertidas.
 */

import { normalizePlanPath } from './planGuard.js';

/**
 * Tope de steps por plan. Es el número que el system prompt del Architect ya
 * declara ("maximum 8 steps") desde f5e99dc; vive aquí para que el mensaje que
 * ve el usuario y el corte que se aplica salgan de la MISMA constante y no
 * puedan volver a desincronizarse (el warning decía "the first 6" mucho después
 * de que el tope real fuese 8).
 */
export const TRIM_MAX_STEPS = 8;

/**
 * Los cuatro archivos que ningún recorte puede tocar.
 *
 * Los tres primeros son, literalmente, INITIAL_BUILD_REQUIRED_PATHS: el set que
 * el planGuard reinyecta si falta. Recortarlos sería trabajo tirado —el guard
 * los devuelve al plan acto seguido— y fuera del initial build, donde el guard
 * NO interviene, sería una pérdida silenciosa.
 *
 * `src/App.tsx` entra por su propio motivo: es donde viven las rutas. Un plan
 * que crea páginas nuevas y pierde el step de App.tsx produce componentes
 * inalcanzables — el mismo fallo que el chrome sin brandear, sólo que en el
 * router.
 */
export const PROTECTED_TRIM_PATHS = Object.freeze([
  'src/components/layout/Header.tsx',
  'src/components/layout/Footer.tsx',
  'src/pages/Index.tsx',
  'src/App.tsx',
]);

const PROTECTED_SET = new Set(PROTECTED_TRIM_PATHS);

/**
 * ¿Es este `file_path` uno de los protegidos?
 *
 * Comparación EXACTA sobre el path normalizado (normalizePlanPath: separadores
 * de Windows a `/`, espacios recortados, prefijos `./` y `/` eliminados), no el
 * `endsWith('layout/Header.tsx')` del recorte anterior.
 *
 * El cambio es deliberado y estrecha el criterio. Lo que la protección compra
 * es que el archivo SE ESCRIBA, y el Implementer lo abre con
 * `files.get(step.file_path)`: un step cuyo path no es exactamente el del mapa
 * de archivos no escribe el header pase lo que pase, así que protegerlo sólo
 * gastaba presupuesto. Además es la misma normalización y los mismos literales
 * que usa missingRequiredPaths, de modo que el trim y el planGuard no pueden
 * discrepar sobre qué step es "el step del Header".
 *
 * @param {unknown} value
 * @returns {boolean} false ante cualquier basura — un step ilegible no es un
 *   protegido, y ser recortable es el lado seguro para lo que no se entiende.
 */
export function isProtectedTrimPath(value) {
  const normalized = normalizePlanPath(value);
  return normalized.length > 0 && PROTECTED_SET.has(normalized);
}

/**
 * `order` comparable de un step. Ilegible → +Infinity.
 *
 * FAIL-CLOSED: un step sin `order` numérico es el menos fiable del plan (el
 * Implementer tampoco sabrá cuándo ejecutarlo), así que ordena al final y es lo
 * PRIMERO que se cae cuando hay que recortar. Lo contrario —tratarlo como 0—
 * lo pondría a salvo por ser basura.
 *
 * @param {unknown} step
 * @returns {number}
 */
function orderOf(step) {
  if (step === null || typeof step !== 'object') return Number.POSITIVE_INFINITY;
  const n = Number(step.order);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/**
 * Recorta el plan al presupuesto conservando lo protegido.
 *
 * CRITERIO: sort ESTABLE por `order` ascendente sobre los recortables (empates
 * y `order` ilegibles desempatan por posición original, así que el resultado es
 * función determinista de la entrada), se conservan los primeros
 * `TRIM_MAX_STEPS - protegidos` y se les suman TODOS los protegidos. Los
 * protegidos nunca cuentan como recortables: no compiten por el hueco, lo
 * consumen antes de repartirlo.
 *
 * EMISIÓN: el array devuelto conserva el ORDEN ORIGINAL del plan (se filtra por
 * índice), igual que hacía el recorte anterior. El `order` decide QUÉ
 * sobrevive, no en qué orden se emite; quien decide la ejecución es el sort del
 * Implementer, y reordenar aquí sólo cambiaría lo que se ve en `plan_steps` del
 * log sin cambiar nada de lo que ocurre.
 *
 * NO-OP EXACTO: si no sobra nada, se devuelve la MISMA referencia de array, sin
 * copiar ni reordenar. Un plan que cabe sale byte-idéntico a como entró.
 *
 * @param {unknown} plan
 * @returns {{steps: object[], wasTrimmed: boolean, originalCount: number, keptCount: number}}
 */
export function trimPlan(plan) {
  // Fail-closed: lo que no es un array no es un plan. Cero steps, cero recorte
  // — nunca un recorte inventado sobre una entrada que no entendemos.
  if (!Array.isArray(plan)) {
    return { steps: [], wasTrimmed: false, originalCount: 0, keptCount: 0 };
  }

  const originalCount = plan.length;
  if (originalCount <= TRIM_MAX_STEPS) {
    return { steps: plan, wasTrimmed: false, originalCount, keptCount: originalCount };
  }

  const keptIndices = new Set();
  const trimmable = [];
  for (let index = 0; index < plan.length; index += 1) {
    const step = plan[index];
    const path = step !== null && typeof step === 'object' ? step.file_path : undefined;
    if (isProtectedTrimPath(path)) keptIndices.add(index);
    else trimmable.push({ index, order: orderOf(step) });
  }

  const room = Math.max(0, TRIM_MAX_STEPS - keptIndices.size);
  // Comparador explícito en vez de `a.order - b.order`: con dos +Infinity la
  // resta da NaN y el sort se vuelve indefinido, que es justo el caso de los
  // steps basura.
  const survivors = trimmable
    .slice()
    .sort((a, b) => (a.order === b.order ? a.index - b.index : a.order < b.order ? -1 : 1))
    .slice(0, room);
  for (const entry of survivors) keptIndices.add(entry.index);

  const steps = plan.filter((_, index) => keptIndices.has(index));
  return { steps, wasTrimmed: true, originalCount, keptCount: steps.length };
}

/**
 * Sufijo de telemetría del recorte. Va al `user_prompt` de forge_intent_log —
 * misma gramática que [TARGETS:...], [PLAN_REPAIRED:...], [DELETE_REJECTED:...],
 * [RESTORED:...] y [DDL_PROPOSED:...]: espacio delante, contenido entre
 * corchetes, CADENA VACÍA cuando no hubo recorte, para que el log de siempre no
 * cambie ni una fila.
 *
 * Los dos conteos, no sólo el "se recortó": `[TRIMMED:14→8]` y `[TRIMMED:9→8]`
 * son eventos distintos —el primero dice que el plan lane se queda muy corto
 * para la petición, el segundo que se pasó por uno— y un booleano los borraría.
 *
 * @param {unknown} originalCount Steps que emitió el modelo.
 * @param {unknown} keptCount Steps que sobrevivieron al recorte.
 * @returns {string} '' cuando no hubo recorte o los conteos son ilegibles.
 */
export function trimTelemetry(originalCount, keptCount) {
  const before = Number(originalCount);
  const after = Number(keptCount);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return '';
  const n = Math.floor(before);
  const m = Math.floor(after);
  // Fail-closed: sin recorte real (o con conteos imposibles) no se marca nada.
  if (m < 0 || n <= m) return '';
  return ` [TRIMMED:${n}→${m}]`;
}

/**
 * Warning efímero que acompaña la respuesta cuando hubo recorte.
 *
 * Existe como función pura por lo mismo que TRIM_MAX_STEPS es una constante: el
 * mensaje anterior decía "Only the first 6 were built" con el tope real en 8
 * desde f5e99dc, y decía "the first" cuando el corte ya no es por posición.
 * Números reales, tope real, y un solo sitio donde puedan quedarse obsoletos.
 *
 * @param {unknown} originalCount
 * @param {unknown} keptCount
 * @returns {string} '' cuando no hubo recorte.
 */
export function buildTrimWarning(originalCount, keptCount) {
  if (trimTelemetry(originalCount, keptCount) === '') return '';
  const n = Math.floor(Number(originalCount));
  const m = Math.floor(Number(keptCount));
  // Los protegidos pueden empujar el plan POR ENCIMA del tope; decir entonces
  // "limit: 8" junto a "9 were built" sería incoherente para quien lo lee.
  const budget =
    m > TRIM_MAX_STEPS
      ? `the ${TRIM_MAX_STEPS}-step limit was raised to keep every protected file`
      : `limit: ${TRIM_MAX_STEPS} steps per request`;
  return (
    `This request needed ${n} steps. Only ${m} were built (${budget}). ` +
    'Send a follow-up to continue.'
  );
}
