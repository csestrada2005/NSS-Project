/**
 * Type surface for the plain-JS deterministic server-logic belt
 * (src/utils/serverLogicSignals.js). Hand-written so the browser build stays
 * typed while the implementation remains node-test-importable JavaScript —
 * mismo arreglo que laneRouting.d.ts, ddlGuard.d.ts, migrationPath.d.ts, etc.
 */

/**
 * ¿El prompt crudo del usuario menciona, en español o inglés, alguno de los
 * disparadores deterministas de lógica de servidor? Cualquier valor no-string
 * cuenta como "no hay señal" (false), nunca lanza.
 */
export function promptNeedsServer(prompt: unknown): boolean;
