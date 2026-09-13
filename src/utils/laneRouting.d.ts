/**
 * Type surface for the plain-JS lane routing gates (src/utils/laneRouting.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — mismo arreglo que ddlGuard.d.ts,
 * migrationPath.d.ts, deletionGuard.d.ts y ddlVerdict.d.ts.
 */

/**
 * Forma mínima del intent que necesitan las puertas. Estructural a propósito:
 * evita que utils/ dependa de services/IntentClassifier.
 */
export interface LaneIntent {
  type: string;
  risk: string;
  affected_files: string[];
  requiredPatternIds?: string[];
  needs_server?: boolean;
}

/** Tipos de intent que siempre siguen al plan lane, sea cual sea su risk. */
export const PLAN_LANE_ONLY_TYPES: readonly string[];

/**
 * ¿Este intent tiene prohibidas las lanes rápidas? Por su tipo, por tener
 * `affected_files` fuera del universo de fast/simple lane (fail-closed ante
 * un valor ilegible), porque el prompt crudo menciona `supabase/functions/`,
 * o porque `intent.needs_server === true` (eje independiente del type).
 */
export function isPlanLaneOnly(intent: LaneIntent, prompt?: string): boolean;

/** Gate del fast lane: selección resuelta a un archivo real + intent barato. */
export function canEnterFastLane(args: {
  intent: LaneIntent;
  hasSelection: boolean;
  selectionFileExists: boolean;
  prompt?: string;
}): boolean;

/** Gate del simple lane, decidido con el intent y opcionalmente el prompt crudo. */
export function isSimpleEditIntent(intent: LaneIntent, prompt?: string): boolean;
