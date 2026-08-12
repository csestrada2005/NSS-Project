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
