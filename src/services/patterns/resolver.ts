import { PATTERN_REGISTRY, InjectionPattern } from './registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolverResult {
  context: string;
  resolved: string[];
  dropped: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatPattern(pattern: InjectionPattern): string {
  return `[PATTERN: ${pattern.id}] Code Context: ${pattern.codeContext} Rules:\n1. ${pattern.rules[0]}\n2. ${pattern.rules[1]}\n3. ${pattern.rules[2]}`;
}

// ---------------------------------------------------------------------------
// resolvePatterns
// ---------------------------------------------------------------------------

export function resolvePatterns(patternIds: string[], tokenBudget = 2000): ResolverResult {
  // Deduplicate preserving first-occurrence order
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of patternIds) {
    if (!seen.has(id)) {
      seen.add(id);
      deduped.push(id);
    }
  }

  const excluded = new Set<string>();
  const selected: InjectionPattern[] = [];
  const dropped: string[] = [];
  let usedTokens = 0;

  for (const id of deduped) {
    if (excluded.has(id)) {
      console.log(`[PatternResolver] Excluded by incompatibility: ${id}`);
      dropped.push(id);
      continue;
    }

    const pattern = PATTERN_REGISTRY.get(id);
    if (!pattern) {
      console.log(`[PatternResolver] Unknown pattern ID: ${id}`);
      dropped.push(id);
      continue;
    }

    if (usedTokens + pattern.maxTokenEstimate > tokenBudget) {
      console.log(`[PatternResolver] Token budget exceeded, dropping: ${id}`);
      dropped.push(id);
      continue;
    }

    selected.push(pattern);
    usedTokens += pattern.maxTokenEstimate;
    for (const incompatible of pattern.incompatibleWith) {
      excluded.add(incompatible);
    }
  }

  const context = selected.map(formatPattern).join('\n\n');

  return {
    context,
    resolved: selected.map(p => p.id),
    dropped,
  };
}
