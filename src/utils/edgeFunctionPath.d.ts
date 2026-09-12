/**
 * Type surface for the plain-JS edge-function-path helpers
 * (src/utils/edgeFunctionPath.js). Hand-written so the browser build stays
 * typed while the implementation remains node-test-importable JavaScript —
 * same arrangement as migrationPath.d.ts and deletionGuard.d.ts.
 */

/** Prefix under which a generated project's Edge Functions live. */
export const EDGE_FUNCTIONS_DIR: string;

/** True for a slug the Supabase Management API accepts: `[a-z0-9-]+`, max 50 chars. */
export function isValidEdgeFunctionSlug(slug: string): boolean;

/**
 * True only for `supabase/functions/<slug>/index.ts` at exact depth 4, with a
 * slug the Management API would accept.
 */
export function isEdgeFunctionEntrypoint(path: string): boolean;

/** The slug for an Edge Function entrypoint path, or `null` if it doesn't qualify. */
export function edgeFunctionSlug(path: string): string | null;
