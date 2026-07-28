import { SupabaseService } from './SupabaseService';

interface PatternRow {
  id?: string;
  name: string;
  category: string;
  description: string;
  code_example: string;
}

export class PatternRetriever {
  /**
   * Retrieves architecture patterns from two independent sources and merges them:
   *
   *   1. Deterministic — the patterns the IntentClassifier explicitly requested
   *      (intent.requiredPatternIds) are looked up by id/name directly from
   *      forge_patterns. Embedding pattern IDs to search them by similarity is
   *      wrong at the root: IDs are resolved by exact lookup, not vector distance.
   *   2. Vector — the CLEAN user prompt (no intent.type / domain / pattern IDs /
   *      prefixes, just the text the user wrote) is sent to /api/embed-and-search
   *      for semantic similarity.
   *
   * Deterministic hits come first, vector hits after, deduped by id (falling
   * back to name), capped to `limit` total. The output shape handed to the
   * Architect/Implementer is unchanged — only how the patterns are obtained.
   */
  public static async retrieve(
    query: string,
    requiredPatternIds: string[] = [],
    limit = 4,
  ): Promise<string> {
    let direct: PatternRow[] = [];
    let vector: PatternRow[] = [];

    try {
      direct = await this.fetchByIds(requiredPatternIds);
    } catch (err) {
      console.error('[PatternRetriever] direct lookup failed:', err);
    }

    try {
      vector = await this.fetchByVector(query, limit);
    } catch (err) {
      console.error('[PatternRetriever] vector search failed:', err);
    }

    console.log('[PatternRetriever] direct:', direct.length, '| vector:', vector.length, '| query:', query);

    // Fusion: deterministic first, vector after, dedup by id (fallback to name),
    // respecting the total limit the retriever applies today.
    const merged: PatternRow[] = [];
    const seen = new Set<string>();
    for (const pattern of [...direct, ...vector]) {
      if (!pattern) continue;
      const key = pattern.id ?? pattern.name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(pattern);
      if (merged.length >= limit) break;
    }

    return this.format(merged);
  }

  /**
   * Deterministic source: fetch the classifier-requested patterns directly from
   * forge_patterns (readable by authenticated users per RLS). The classifier's
   * IDs can be either an id or a name, so we match against both columns.
   * Non-existent IDs are simply ignored.
   */
  private static async fetchByIds(ids: string[]): Promise<PatternRow[]> {
    const list = (ids ?? []).map(id => id?.trim()).filter(Boolean) as string[];
    if (list.length === 0) return [];

    const client = SupabaseService.getInstance().client;
    const columns = 'id, name, category, description, code_example';

    // Classifier IDs are names, so match by name first — this is the normal
    // path and never triggers a 400 from a uuid id column rejecting slugs.
    const { data: byName, error: nameError } = await client
      .from('forge_patterns')
      .select(columns)
      .in('name', list);

    if (nameError) {
      console.error('[PatternRetriever] forge_patterns lookup error:', nameError);
      return [];
    }

    const rows = (byName as PatternRow[]) ?? [];
    if (rows.length >= list.length) {
      return rows;
    }

    // Some requested IDs did not resolve by name — try an additional lookup by
    // id for the remainder. The id column may be a non-text type (e.g. uuid)
    // that rejects slug values and returns 400, so this is best-effort only.
    const resolved = new Set(rows.map(row => row.name));
    const missing = list.filter(id => !resolved.has(id));
    try {
      const { data: byId, error: idError } = await client
        .from('forge_patterns')
        .select(columns)
        .in('id', missing);

      if (!idError && byId) {
        for (const row of byId as PatternRow[]) {
          if (!rows.some(existing => existing.id === row.id)) {
            rows.push(row);
          }
        }
      }
    } catch {
      // Tolerate a 400 from an incompatible id column — name results stand.
    }

    return rows;
  }

  /**
   * Vector source: embed the CLEAN user prompt and similarity-search via the
   * existing /api/embed-and-search endpoint (threshold 0.3, unchanged).
   */
  private static async fetchByVector(query: string, limit: number): Promise<PatternRow[]> {
    if (!query || query.trim() === '') return [];

    const authHeader = await SupabaseService.getInstance().getAuthHeader();
    const response = await fetch('/api/embed-and-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
      },
      body: JSON.stringify({ query, limit }),
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { patterns?: PatternRow[] };
    return data.patterns ?? [];
  }

  /**
   * Serializes merged patterns into the Architect/Implementer context format.
   * Unchanged shape: truncates at the last complete pattern under 6000 chars.
   */
  private static format(patterns: PatternRow[]): string {
    let resultString = '';
    for (const pattern of patterns) {
      const block = `=== PATTERN: ${pattern.name} (${pattern.category}) ===\n${pattern.description}\n${pattern.code_example}\n=== END PATTERN ===`;

      // If adding this block plus the separator (if resultString is not empty)
      // exceeds 6000 chars, we truncate at the last complete pattern.
      const separator = resultString.length > 0 ? '\n\n' : '';
      if (resultString.length + separator.length + block.length > 6000) {
        break;
      }

      resultString += separator + block;
    }

    return resultString;
  }
}
