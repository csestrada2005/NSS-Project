/**
 * promptCache — helper to mark the static prefix of a pipeline call as
 * cacheable (Anthropic prompt caching).
 *
 * WHY
 * ---
 * Every lane of a single generation resends the SAME large static system prompt
 * (rules + format contract) on each call: the Implementer fires one call per
 * plan step, the Verifier one per repair batch. Those system prefixes are byte-
 * for-byte identical within a generation, so marking them with cache_control
 * lets calls 2..N read the prefix from cache (cache_read_input_tokens) instead of
 * re-billing it as fresh input. The first call writes the cache
 * (cache_creation_input_tokens), every subsequent call inside the 5-minute window
 * reads it.
 *
 * The /api/chat-forge proxy forwards `system` untouched, so a system value shaped
 * as an array of content blocks with cache_control flows straight to the API.
 *
 * Caching only kicks in when the cached prefix is large enough (≥1024 tokens for
 * Sonnet, ≥2048 for Haiku). The pipeline system prompts (REACT_TAILWIND_RULES +
 * format contract, ~2k tokens) clear that bar; short prompts simply never get a
 * cache hit, which is harmless.
 */

export interface CacheableTextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

/**
 * Wrap a system-prompt string as a single cache-controlled content block so the
 * static prefix is billed once and read from cache on repeat calls.
 */
export function cachedSystem(text: string): CacheableTextBlock[] {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

/**
 * Build a multi-block cached system prompt (CAMBIO 1 — full static-prefix
 * caching). Each non-empty block gets its own cache_control breakpoint.
 *
 * WHY MULTIPLE BLOCKS
 * -------------------
 * A single generation runs three Sonnet lanes back to back — Architect (once),
 * Implementer (once per plan step) and Verifier (once per repair batch). They
 * all share the SAME static project context: the React/Tailwind rules, the
 * design brief and the project blueprint. If every lane leads its `system` with
 * that identical block, the FIRST call writes it to cache and every later call
 * (across lanes AND across steps) reads it back as cache_read instead of paying
 * fresh input — provided the shared block is a byte-identical PREFIX.
 *
 * So the caller passes the shared project prefix as the first block and its
 * lane-specific role instructions as the second. Marking both with
 * cache_control creates two breakpoints: the first caches the shared prefix
 * (reused by every lane on the same model), the second caches the full
 * lane-specific prefix (reused by every call within that one lane). Empty
 * blocks are dropped so a lane with no project context degrades cleanly to a
 * single-block cache. The API allows up to four breakpoints; we use two.
 */
export function cachedSystemBlocks(
  ...texts: Array<string | null | undefined>
): CacheableTextBlock[] {
  return texts
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    .map(text => ({ type: 'text', text, cache_control: { type: 'ephemeral' } }));
}
