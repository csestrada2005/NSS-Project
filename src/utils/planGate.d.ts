/**
 * Type surface for the plain-JS plan gate (src/utils/planGate.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — mismo arreglo que planTrim.d.ts,
 * laneRouting.d.ts, planGuard.d.ts y deletionGuard.d.ts.
 */

/** La única `action` de un step que dispara el gate por sí sola: 'delete'. */
export const GATED_ACTION: string;

/**
 * ¿Se para el plan para que lo apruebe una persona?
 *
 * true cuando `planModeEnabled === true` (siempre, sea cual sea el plan) o
 * cuando `steps` es un array con al menos un step `action === 'delete'`.
 * Fail-closed ante basura: un plan que no es array, o cuyos steps no tienen
 * `action` legible, NO gatea por sí solo — el gate es fricción, la seguridad de
 * los borrados vive en deletionGuard.js.
 */
export function shouldGatePlan(steps: unknown, planModeEnabled: unknown): boolean;

/** ' [PLAN_REJECTED]' — sufijo para forge_intent_log, sin payload. */
export function planRejectedTelemetry(): string;
