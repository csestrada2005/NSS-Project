/**
 * ddlProposalState — QUÉ propuesta de DDL puede ejecutarse, decidido fuera de
 * la UI y sin tocar nada.
 *
 * POR QUÉ ES UN MÓDULO PURO Y NO ESTADO DEL COMPONENTE
 * ---------------------------------------------------
 * Aplicar un DDL es la única operación IRREVERSIBLE del sistema. Lo que decide
 * si el botón se pinta ejecutable no puede vivir en un `useState` que se
 * rehidrata, se remonta y se sincroniza con el padre por tres caminos distintos
 * (ChatInterface tiene exactamente ese problema documentado en su cabecera):
 * un estado de UI desfasado que habilita un `DROP TABLE` ya aplicado es
 * precisamente el fallo que esta cirugía no puede permitirse.
 *
 * Por eso el estado NO se guarda: se DERIVA, cada vez, de los mensajes del
 * chat, que son la única historia que sobrevive al remontaje del modal y al
 * refresh (forge_chat_messages). Mismo patrón que laneRouting.js y
 * ddlVerdict.js: función pura, sin I/O, verificable por tests.
 *
 * LA HISTORIA SE LEE DE DOS MARCAS
 * --------------------------------
 *   [DDL_PROPOSED:<path>[,<path>]]   el pipeline dejó migraciones escritas y
 *                                    sin aplicar. Formato IDÉNTICO al sufijo de
 *                                    telemetría (migrationPath.js), y se
 *                                    construye llamando a esa misma función
 *                                    para que los dos no puedan divergir.
 *   [DDL_OUTCOME:<outcome>:<paths>]  alguien ya pulsó el botón para esa
 *                                    propuesta y ESTE fue el veredicto del
 *                                    runner.
 *
 * La marca de resultado es un namespace PROPIO, no [DDL_APPLIED:]/[DDL_FAILED:]
 * de ddlVerdict.js: aquellas viven en forge_intent_log y su carga son las
 * TABLAS tocadas o el error de Postgres; ésta vive en el chat y su carga son
 * los PATHS, porque lo que tiene que resolver es "¿a qué propuesta se refiere?".
 * Compartir etiqueta volvería ambiguo un grep sobre cualquiera de los dos sitios.
 *
 * HISTORIAL ANTERIOR A CIRUGÍA 2: NO HAY NINGUNA PROPUESTA, Y ES CORRECTO
 * ----------------------------------------------------------------------
 * Este módulo NO parsea las marcas de Cirugía 1, y no es un olvido: es que no
 * hay nada que parsear. Las marcas de C1 —[DDL_PROPOSED:] incluida— se
 * escribieron SIEMPRE en el sufijo de `user_prompt` de forge_intent_log, por
 * AIOrchestrator.logIntent y MigrationRunner.logMigrationIntent. Ningún camino
 * las copia a forge_chat_messages, que es la ÚNICA tabla que este módulo lee.
 * Un chat generado antes de C2 no contiene marcas de ninguna familia.
 *
 * De ahí el comportamiento declarado sobre historial viejo, verificado en
 * server/ddlProposalState.test.js:
 *
 *   Cero propuestas. Cero ejecutables. Ningún botón, en ningún mensaje.
 *
 * Lo que eso significa en la práctica, dicho sin adornos: una migración
 * generada bajo C1 y NUNCA aplicada tampoco gana botón. Su mensaje no lleva
 * marca, así que para este módulo no existe. El camino es pedirla otra vez por
 * chat, lo que produce una propuesta nueva —con marca— sobre el mismo trabajo.
 * Es la dirección segura del error: no ofrecer de más sobre datos que no
 * podemos interpretar.
 *
 * Y por qué NO se parsea el formato viejo aunque apareciera: [DDL_APPLIED:] de
 * C1 carga TABLAS (`[DDL_APPLIED:notas_c1]` nombra la tabla, no el archivo).
 * Una propuesta se identifica por sus PATHS, así que esa marca no puede decir
 * a qué propuesta cierra sin adivinarlo — y adivinar de qué migración habla un
 * veredicto es justo lo que no se puede hacer sobre la única operación
 * irreversible del sistema. Por si acaso llegara al chat por otra vía (alguien
 * pega una línea de log), el resolutor la trata como texto: ni crea propuesta
 * ni cierra ninguna.
 *
 * LAS REGLAS, QUE SON DOS
 * -----------------------
 *  1. Sólo la propuesta MÁS RECIENTE del proyecto es ejecutable. Una propuesta
 *     anterior describe un schema que el modelo ya reemplazó al generar la
 *     siguiente; aplicarla es aplicar un plan viejo sobre una base que la
 *     propuesta nueva ya da por hecha. Las anteriores quedan `superseded`, sin
 *     acción posible.
 *  2. Una propuesta con veredicto NO vuelve a ser ejecutable, ni siquiera si
 *     falló. Reintentar el mismo SQL que la base ya rechazó da el mismo rechazo;
 *     el camino de un fallo es pedir la corrección por chat, lo que genera una
 *     propuesta NUEVA que supersede a la fallida por la regla 1.
 *
 * De las dos sale el invariante que hace seguro el botón: como mucho UNA
 * propuesta `executable` en todo el historial.
 *
 * Y sobreviven a que el historial esté RECORTADO —el chat guarda los últimos 30
 * en memoria y rehidrata 50 de la base— porque un veredicto nunca es más
 * antiguo que su propuesta: si la propuesta entra en la ventana, su veredicto
 * también. Ninguna ventana puede dejar una propuesta ya aplicada pareciendo
 * ejecutable.
 *
 * `unverified` NO ES UN ESTADO
 * ----------------------------
 * MigrationRunner distingue 'failed' (la base lo rechazó; se arregla el SQL) de
 * 'unverified' (pudo aplicarse y el instrumento no lo confirma; se mira a mano).
 * Los dos caen en el estado `failed` —ninguno de los dos vuelve a ser
 * ejecutable, y re-ejecutar un DDL que quizá YA corrió es justo lo que no se
 * debe ofrecer— pero el `outcome` crudo viaja intacto en la entrada resuelta,
 * porque la UI tiene que decir cosas opuestas en cada caso.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * laneRouting.js, ddlVerdict.js y ddlGuard.js. El tipado vive en
 * ddlProposalState.d.ts.
 */

import { isMigrationPath, ddlProposedTelemetry } from './migrationPath.js';

// --- Estados de una propuesta -------------------------------------------------

/** Es la última propuesta y nadie la ha ejecutado: el botón actúa. */
export const EXECUTABLE = 'executable';
/** Llegó una propuesta posterior. Sin acción: el plan que describe es viejo. */
export const SUPERSEDED = 'superseded';
/** El diff del schema demostró que se aplicó. */
export const APPLIED = 'applied';
/** Se ejecutó y no acabó aplicada (rechazo de la base, o veredicto no verificable). */
export const FAILED = 'failed';
/** El proyecto no tiene base de datos: no se ejecutó nada. */
export const SKIPPED = 'skipped';

// --- Veredictos que el runner puede devolver ---------------------------------
// Mismos valores que MigrationOutcome en MigrationRunner.ts: la marca del chat
// transporta el veredicto TAL CUAL, sin traducirlo, para no perder el matiz
// entre 'failed' y 'unverified' por el camino.

export const OUTCOME_APPLIED = 'applied';
export const OUTCOME_FAILED = 'failed';
export const OUTCOME_UNVERIFIED = 'unverified';
export const OUTCOME_SKIPPED = 'skipped';

const OUTCOMES = Object.freeze([
  OUTCOME_APPLIED,
  OUTCOME_FAILED,
  OUTCOME_UNVERIFIED,
  OUTCOME_SKIPPED,
]);

/** Estado que corresponde a cada veredicto ya emitido. */
const STATE_BY_OUTCOME = Object.freeze({
  [OUTCOME_APPLIED]: APPLIED,
  [OUTCOME_FAILED]: FAILED,
  // 'unverified' comparte estado con 'failed' —tampoco vuelve a ser ejecutable—
  // pero no comparte mensaje: ver la cabecera.
  [OUTCOME_UNVERIFIED]: FAILED,
  [OUTCOME_SKIPPED]: SKIPPED,
});

/** Una marca de cualquiera de las dos familias, con su carga sin parsear. */
const MARK_RE = /\[DDL_(PROPOSED|OUTCOME):([^\]]*)\]/g;

/**
 * Normaliza una lista de paths de migración: recorta, descarta lo que no es una
 * migración y deduplica conservando el orden.
 *
 * El filtro por isMigrationPath es una GUARDA, no cosmética: lo que salga de
 * aquí es lo que el botón le pasa al runner para leerlo de forge_files y
 * ejecutarlo. Un mensaje de chat es texto, y aunque sólo se leen los del
 * asistente, el único path que este módulo deja pasar es
 * `supabase/migrations/*.sql`.
 *
 * @param {Iterable<string>} paths
 * @returns {string[]}
 */
export function normalizeProposalPaths(paths) {
  const out = [];
  for (const raw of paths ?? []) {
    const path = typeof raw === 'string' ? raw.trim() : '';
    if (!isMigrationPath(path)) continue;
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

/** Clave de identidad de una propuesta: sus paths, en orden, tal como se marcan. */
function proposalKey(paths) {
  return paths.join(',');
}

/**
 * Marca de propuesta para el mensaje del asistente.
 *
 * Delega en ddlProposedTelemetry para que el formato del chat y el del
 * forge_intent_log sean literalmente el mismo código: si un día cambia, cambia
 * en los dos sitios a la vez o no cambia en ninguno.
 *
 * @param {Iterable<string>} paths
 * @returns {string} ` [DDL_PROPOSED:a,b]`, o '' si no hay migraciones
 */
export function ddlProposedMark(paths) {
  return ddlProposedTelemetry(paths);
}

/**
 * Marca de veredicto para el mensaje que el botón escribe tras ejecutar.
 *
 * `paths` tiene que ser el juego COMPLETO de la propuesta: es lo que la ata a
 * ella y no a otra.
 *
 * @param {string} outcome uno de OUTCOME_*
 * @param {Iterable<string>} paths
 * @returns {string} ` [DDL_OUTCOME:applied:a,b]`, o '' si la entrada no es válida
 */
export function ddlOutcomeMark(outcome, paths) {
  if (!OUTCOMES.includes(outcome)) return '';
  const list = normalizeProposalPaths(paths);
  if (list.length === 0) return '';
  return ` [DDL_OUTCOME:${outcome}:${proposalKey(list)}]`;
}

/**
 * Quita las marcas del texto que se le enseña al usuario.
 *
 * Las marcas viven en el CONTENIDO del mensaje (es lo que se persiste en
 * forge_chat_messages y lo que sobrevive al refresh), pero son maquinaria: lo
 * que el usuario ve es el botón. Se colapsan los espacios que deja el recorte
 * para que no queden huecos dobles a mitad de frase.
 *
 * @param {string} content
 * @returns {string}
 */
export function stripDdlMarks(content) {
  return String(content ?? '')
    .replace(MARK_RE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/**
 * Todas las propuestas del historial, en orden cronológico, con su estado.
 *
 * SÓLO se leen los mensajes del ASISTENTE. Un mensaje de usuario es texto que
 * escribe el usuario: si contara, teclear `[DDL_PROPOSED:…]` en el chat pintaría
 * un botón de ejecución. Las marcas las emite esta aplicación, y sólo en
 * mensajes del asistente.
 *
 * @param {{ role?: string, content?: string }[]} messages
 * @returns {{
 *   paths: string[],
 *   key: string,
 *   messageIndex: number,
 *   outcome: string|null,
 *   outcomeMessageIndex: number|null,
 *   state: string,
 * }[]}
 */
export function resolveDdlProposals(messages) {
  const proposals = [];
  const list = Array.isArray(messages) ? messages : [];

  for (let i = 0; i < list.length; i++) {
    const message = list[i];
    if (!message || message.role !== 'assistant') continue;
    const content = typeof message.content === 'string' ? message.content : '';
    if (content.length === 0) continue;

    // Un solo barrido por mensaje: propuestas y veredictos se procesan en el
    // ORDEN en que aparecen en el texto, no por familias. Es lo que hace que un
    // mensaje que llevara las dos marcas se lea como lo que dice, en vez de
    // depender de en qué orden barremos nosotros.
    MARK_RE.lastIndex = 0;
    let hit;
    while ((hit = MARK_RE.exec(content)) !== null) {
      const [, family, payload] = hit;

      if (family === 'PROPOSED') {
        const paths = normalizeProposalPaths(payload.split(','));
        if (paths.length === 0) continue;
        proposals.push({
          paths,
          key: proposalKey(paths),
          messageIndex: i,
          outcome: null,
          outcomeMessageIndex: null,
          state: EXECUTABLE,
        });
        continue;
      }

      // OUTCOME: `<outcome>:<paths>`. El path puede llevar cualquier cosa menos
      // `]`, así que se corta por el PRIMER `:` y el resto es la lista.
      const sep = payload.indexOf(':');
      if (sep === -1) continue;
      const outcome = payload.slice(0, sep).trim();
      if (!OUTCOMES.includes(outcome)) continue;
      const paths = normalizeProposalPaths(payload.slice(sep + 1).split(','));
      if (paths.length === 0) continue;

      // Resuelve la propuesta MÁS RECIENTE que aún no tenga veredicto y coincida
      // en paths. Buscar hacia atrás es lo correcto cuando un mismo juego de
      // paths se propuso dos veces: el veredicto cierra la propuesta viva, no
      // la que ya se cerró.
      const key = proposalKey(paths);
      for (let p = proposals.length - 1; p >= 0; p--) {
        if (proposals[p].key !== key || proposals[p].outcome !== null) continue;
        proposals[p].outcome = outcome;
        proposals[p].outcomeMessageIndex = i;
        break;
      }
    }
  }

  // Estados. La única que puede quedar ejecutable es la ÚLTIMA sin veredicto:
  // de ahí sale el invariante de "como mucho una executable".
  const lastIndex = proposals.length - 1;
  for (let p = 0; p < proposals.length; p++) {
    const proposal = proposals[p];
    if (proposal.outcome !== null) {
      proposal.state = STATE_BY_OUTCOME[proposal.outcome];
    } else {
      proposal.state = p === lastIndex ? EXECUTABLE : SUPERSEDED;
    }
  }

  return proposals;
}

/**
 * Texto plano y sin corchetes, para meterlo en un mensaje de chat.
 *
 * Los motivos que devuelve MigrationRunner ya vienen saneados, pero esto es lo
 * que separa un error de Postgres de la maquinaria del chat: un mensaje de la
 * base que contuviera `[DDL_OUTCOME:applied:…]` FABRICARÍA un veredicto al
 * releerse el historial. La defensa no puede depender de que el caller
 * saneara: se sanea aquí, que es donde el texto ajeno entra en el mensaje.
 *
 * @param {unknown} text
 * @returns {string}
 */
function plain(text) {
  return String(text ?? '')
    .replace(/[[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre de archivo, sin el `supabase/migrations/` que llevan todos. */
function fileName(path) {
  const cut = String(path ?? '').lastIndexOf('/');
  return cut === -1 ? String(path ?? '') : String(path).slice(cut + 1);
}

/**
 * El mensaje que el botón escribe en el chat tras ejecutar: el texto que lee el
 * usuario MÁS la marca que cierra la propuesta.
 *
 * Se construye aquí, junto al parser, por una razón concreta: lo que se escribe
 * tiene que volver a leerse como el mismo veredicto sobre la MISMA propuesta.
 * Que las dos mitades vivan en el mismo módulo es lo que permite probar esa ida
 * y vuelta en vez de confiar en ella.
 *
 * Los cuatro veredictos dicen cosas distintas porque piden acciones distintas:
 *  applied     → hecho, y qué tablas se movieron.
 *  failed      → la base lo rechazó: se ARREGLA EL SQL, por chat.
 *  unverified  → pudo aplicarse y no se puede confirmar: se MIRA A MANO. Jamás
 *                "vuelve a intentarlo": re-ejecutar un DDL que quizá ya corrió
 *                es el consejo peligroso.
 *  skipped     → no había base de datos; no se ejecutó nada.
 *
 * @param {{
 *   outcome: string,
 *   paths: Iterable<string>,
 *   appliedPaths?: Iterable<string>,
 *   tables?: Iterable<string>,
 *   reason?: string|null,
 *   failedPath?: string|null,
 * }} result
 * @returns {string} contenido completo del mensaje, marca incluida
 */
export function buildOutcomeMessage(result) {
  const paths = normalizeProposalPaths(result?.paths);
  const outcome = result?.outcome;
  const mark = ddlOutcomeMark(outcome, paths);
  if (mark === '') return '';

  const applied = normalizeProposalPaths(result?.appliedPaths);
  const tables = [];
  for (const t of result?.tables ?? []) {
    const table = plain(t);
    if (table && !tables.includes(table)) tables.push(table);
  }
  const reason = plain(result?.reason);
  const failed = plain(fileName(result?.failedPath ?? paths[applied.length] ?? paths[0]));
  const names = paths.map(fileName).join(', ');

  const parts = [];

  if (outcome === OUTCOME_APPLIED) {
    parts.push(`Migración aplicada: ${names}.`);
    parts.push(
      tables.length > 0
        ? `El schema del proyecto cambió en: ${tables.join(', ')}.`
        : 'El schema del proyecto cambió.'
    );
    // Un apply real NO se degrada porque su telemetría fallara, pero tampoco se
    // calla: es exactamente el fallo que la Cirugía 1 vino a matar.
    if (reason) parts.push(`Aviso: ${reason}.`);
  } else if (outcome === OUTCOME_FAILED) {
    parts.push(`La base de datos rechazó ${failed}${reason ? `: ${reason}.` : '.'}`);
    parts.push(
      'No se aplicó nada de esa migración. Pídeme aquí la corrección del SQL y generaré una ' +
      'propuesta nueva; ésta ya no se puede reintentar.'
    );
  } else if (outcome === OUTCOME_UNVERIFIED) {
    parts.push(
      `Ejecuté ${failed}, pero el schema no muestra ningún cambio${reason ? ` (${reason})` : ''}.`
    );
    parts.push(
      'Puede que se aplicara y el diff no lo vea (RLS, índices o permisos quedan fuera de lo que ' +
      'mide), o puede que no hiciera nada. Revísalo en tu base antes de volver a pedirlo: no ' +
      'reejecuto un DDL que quizá ya corrió.'
    );
  } else {
    parts.push('Este proyecto todavía no tiene base de datos, así que no ejecuté nada.');
    parts.push(
      'La migración sigue guardada en el proyecto. Conecta una base de datos y vuelve a pedírmelo ' +
      'por aquí.'
    );
  }

  // Un lote que se cortó a la mitad: lo que YA se aplicó no se deshace, y
  // callarlo dejaría al usuario creyendo que la base sigue intacta.
  if (outcome !== OUTCOME_APPLIED && applied.length > 0) {
    parts.push(`Sí se habían aplicado antes: ${applied.map(fileName).join(', ')}.`);
  }

  return `${parts.join(' ')}${mark}`;
}

/**
 * La propuesta ejecutable del historial, si la hay.
 *
 * Es lo que el botón vuelve a llamar EN EL MOMENTO DEL CLICK: entre el render y
 * el click pudo entrar otra propuesta (o el veredicto de ésta desde otra
 * pestaña rehidratada), y el estado con el que se pintó ya no vale. Si esto
 * devuelve null, o algo que no es la propuesta que se pulsó, no se ejecuta.
 *
 * @param {{ role?: string, content?: string }[]} messages
 * @returns {object|null}
 */
export function findExecutableProposal(messages) {
  const proposals = resolveDdlProposals(messages);
  for (const proposal of proposals) {
    if (proposal.state === EXECUTABLE) return proposal;
  }
  return null;
}

/**
 * ¿Es ESTA propuesta —la que se pulsó— la ejecutable AHORA?
 *
 * @param {{ role?: string, content?: string }[]} messages historial actual
 * @param {{ key?: string }} proposal la propuesta con la que se pintó el botón
 * @returns {boolean}
 */
export function isStillExecutable(messages, proposal) {
  if (!proposal || typeof proposal.key !== 'string') return false;
  const current = findExecutableProposal(messages);
  return current !== null && current.key === proposal.key;
}
