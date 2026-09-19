/**
 * Type surface for the plain-JS deploy-time Supabase client swap
 * (src/utils/deploySupabaseClient.js) — same arrangement as
 * rlsPolicyGuard.d.ts: node-test-importable JS, typed for the browser build.
 */

/** Path (as used in the project's flat `files` map) of the vendored Supabase client. */
export const SUPABASE_CLIENT_PATH: string;

/**
 * Production-ready Supabase client source: no preview-only workarounds
 * (real persistSession/autoRefreshToken, default GoTrueClient lock).
 */
export const PRODUCTION_SUPABASE_CLIENT_SOURCE: string;

/**
 * Returns a copy of `files` with SUPABASE_CLIENT_PATH's content replaced by
 * PRODUCTION_SUPABASE_CLIENT_SOURCE when present; `files` itself is never
 * mutated. Files without that path are returned unchanged (e.g. a project
 * with no database provisioned).
 */
export function applyProductionSupabaseClient<T extends Record<string, string> | null | undefined>(
  files: T
): T;
