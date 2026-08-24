/**
 * migrationIntent — el payload de telemetría de una migración aplicada, y el
 * veredicto de si esa telemetría llegó a la base.
 *
 * EL FALLO QUE ESTO REPARA
 * ------------------------
 * MigrationRunner.close() no pasaba intentRisk; logMigrationIntent lo tenía
 * opcional; logIntent enviaba `intent_risk: undefined`; supabase-js OMITE las
 * claves undefined al serializar; `intent_risk` es text NOT NULL sin default,
 * así que PostgREST respondía 400 y el `catch` de logIntent se lo tragaba.
 * Resultado: el DDL quedaba aplicado —lo único irreversible del sistema— sin
 * una sola fila en forge_intent_log. Los tests con el insert mockeado no
 * pueden ver eso: el mock acepta cualquier objeto, incluida una clave ausente.
 *
 * Por eso el payload se construye AQUÍ, en una función pura: que la clave
 * `intentRisk` EXISTA con valor es exactamente lo que el bug violaba, y ahora
 * es una aserción sobre un objeto real en vez de una lectura de código.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * ddlVerdict.js, ddlGuard.js y migrationPath.js. El tipado vive en
 * migrationIntent.d.ts.
 */

import { sanitizeReason } from './ddlVerdict.js';

/**
 * Lo que un DDL aplicado ES. No es un parámetro que el caller pueda equivocar.
 */
export const MIGRATION_INTENT_TYPE = 'database_change';

/**
 * Riesgo DECLARADO, no clasificado.
 *
 * No sale de heurística ninguna ni admite matices por migración: el DDL
 * aplicado es la única operación IRREVERSIBLE del sistema —no hay deshacer, no
 * hay rollback de un DROP COLUMN que ya corrió— y por tanto tiene que aparecer
 * en CUALQUIER auditoría que filtre por riesgo. Fijarlo aquí es también lo que
 * garantiza que la columna (text NOT NULL, sin default) nunca vuelva a
 * recibir undefined.
 */
export const MIGRATION_INTENT_RISK = 'high';

/** Marca que se anexa al reason cuando la telemetría no llegó a la base. */
export const TELEMETRY_FAILED_PREFIX = 'telemetry_failed';

/**
 * Mensaje legible y COMPLETO de un error de insert, de cualquier forma.
 *
 * No se recorta: esto es lo que va a console.error, y el mensaje de PostgREST
 * (con su code/details/hint) es justo lo que dice por qué la fila no entró. El
 * recorte para el sufijo `[...]` del log lo hace sanitizeReason, aparte.
 *
 * @param {unknown} e
 * @returns {string}
 */
export function describeIntentError(e) {
  if (e === null || e === undefined || e === '') return 'unknown';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message || 'unknown';
  const parts = [];
  for (const key of ['message', 'code', 'details', 'hint']) {
    const value = /** @type {Record<string, unknown>} */ (e)[key];
    if (typeof value === 'string' && value.trim()) {
      parts.push(key === 'message' ? value.trim() : `${key}=${value.trim()}`);
    }
  }
  if (parts.length > 0) return parts.join(' ');
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/**
 * Normaliza el retorno del insert a una señal que el caller pueda propagar.
 *
 * supabase-js NO lanza cuando PostgREST responde 4xx: devuelve `{ error }`. Un
 * `await insert(...)` sin mirar ese campo es indistinguible de un éxito, que es
 * precisamente cómo la fila perdida pasó desapercibida.
 *
 * @param {unknown} error el `error` del insert, o null/undefined si no hubo
 * @returns {{ ok: boolean, error?: string }}
 */
export function intentLogResult(error) {
  if (error === null || error === undefined || error === '') return { ok: true };
  return { ok: false, error: describeIntentError(error) };
}

/**
 * El objeto EXACTO que logMigrationIntent entrega a logIntent.
 *
 * intentType e intentRisk son constantes: no se aceptan del caller, así que no
 * hay forma de llamar a esto y quedarse sin intent_risk.
 *
 * @param {{
 *   projectId: string,
 *   prompt: string,
 *   modifiedFiles?: string[],
 *   outcome: 'success'|'failed',
 *   errorMessage?: string|null,
 *   durationMs: number,
 * }} params
 */
export function buildMigrationIntentParams(params) {
  return {
    projectId: params.projectId,
    prompt: params.prompt,
    intentType: MIGRATION_INTENT_TYPE,
    intentRisk: MIGRATION_INTENT_RISK,
    modifiedFiles: params.modifiedFiles ?? [],
    outcome: params.outcome,
    errorMessage: params.errorMessage ?? null,
    durationMs: params.durationMs,
  };
}

/**
 * Anexa la marca de telemetría fallida al reason del MigrationResult.
 *
 * NO toca el outcome, y no lo recibe siquiera: el DDL se aplicó o no se aplicó
 * —eso lo decide el diff del schema— y que su registro llegara o no a
 * forge_intent_log es una verdad INDEPENDIENTE. Degradar un apply real a
 * 'failed' porque falló su log sería mentir sobre la base; ocultar el fallo de
 * log sería repetir el bug. Van las dos, separadas, en el mismo resultado.
 *
 * @param {string|undefined} reason reason del veredicto del DDL
 * @param {{ ok: boolean, error?: string }} telemetry retorno de logMigrationIntent
 * @returns {string|undefined}
 */
export function withTelemetryFailure(reason, telemetry) {
  if (telemetry && telemetry.ok) return reason;
  const mark = `${TELEMETRY_FAILED_PREFIX}:${sanitizeReason(telemetry?.error)}`;
  return reason ? `${reason} ${mark}` : mark;
}
