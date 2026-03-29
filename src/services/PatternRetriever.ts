import { platformService } from './PlatformService';
import { SupabaseService } from './SupabaseService';

interface PatternRow {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  code_example: string;
  similarity?: number;
}

interface CacheEntry {
  result: string;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class PatternRetriever {
  private static cache = new Map<string, CacheEntry>();

  public static async retrieve(
    userPrompt: string,
    chatHistory: { role: 'user' | 'assistant'; content: string }[]
  ): Promise<string> {
    try {
      const cacheKey = userPrompt.slice(0, 120);
      const cached = PatternRetriever.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
      }

      const searchQuery = await PatternRetriever.rewriteQuery(userPrompt, chatHistory);

      let results = await PatternRetriever.vectorSearch(searchQuery);
      if (results.length === 0) {
        results = await PatternRetriever.tagFallback(searchQuery);
      }

      const filtered = PatternRetriever.diversityFilter(results, 2, 4);
      const formatted = PatternRetriever.formatForPrompt(filtered);

      PatternRetriever.cache.set(cacheKey, {
        result: formatted,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return formatted;
    } catch (err) {
      console.error('[PatternRetriever]', err);
      return '';
    }
  }

  private static async rewriteQuery(
    prompt: string,
    history: { role: 'user' | 'assistant'; content: string }[]
  ): Promise<string> {
    try {
      const recentContext = history
        .slice(-4)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const userMessage = `${recentContext}\nCurrent request: ${prompt}`;

      const response = await platformService.callChat({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 32,
        system:
          "You are a search query rewriter for a React component library. " +
          "Given a user's build request and recent context, output a single standalone search query " +
          "of 3-8 words describing the UI component or pattern requested. " +
          "Output ONLY the query — no quotes, no punctuation, no explanation. " +
          "Examples: 'make sidebar blue' → 'sidebar navigation component', " +
          "'add email form' → 'email input form validation', " +
          "'dashboard with stats' → 'dashboard KPI card grid'",
        messages: [{ role: 'user', content: userMessage }],
      });

      if (!response.ok) {
        return prompt.slice(0, 80);
      }

      const data = await response.json() as { content?: { type: string; text: string }[] };
      const textBlock = data.content?.find((c) => c.type === 'text');
      return textBlock?.text?.trim() || prompt.slice(0, 80);
    } catch {
      return prompt.slice(0, 80);
    }
  }

  private static async vectorSearch(searchQuery: string): Promise<PatternRow[]> {
    try {
      const authHeader = await SupabaseService.getInstance().getAuthHeader();
      const response = await fetch('/api/embed-and-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        body: JSON.stringify({ query: searchQuery, threshold: 0.70, count: 6 }),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as { patterns?: PatternRow[] };
      return data.patterns ?? [];
    } catch {
      return [];
    }
  }

  private static async tagFallback(query: string): Promise<PatternRow[]> {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    if (keywords.length === 0) {
      return [];
    }

    try {
      const supabase = SupabaseService.getInstance().client;
      const { data, error } = await supabase.rpc('search_forge_patterns_by_tags', {
        search_tags: keywords,
        match_count: 6,
      });

      if (error) {
        return [];
      }

      return (data as PatternRow[]) ?? [];
    } catch {
      return [];
    }
  }

  private static diversityFilter(
    patterns: PatternRow[],
    maxPerCategory: number,
    totalMax: number
  ): PatternRow[] {
    const countByCategory = new Map<string, number>();
    const result: PatternRow[] = [];

    for (const pattern of patterns) {
      if (result.length >= totalMax) break;

      const count = countByCategory.get(pattern.category) ?? 0;
      if (count >= maxPerCategory) continue;

      countByCategory.set(pattern.category, count + 1);
      result.push(pattern);
    }

    return result;
  }

  private static formatForPrompt(patterns: PatternRow[]): string {
    if (patterns.length === 0) {
      return '';
    }

    const sections = patterns.map((p) => {
      const codeSnippet = p.code_example.slice(0, 1200);
      return `### ${p.name} [${p.category}]\n${p.description}\n\`\`\`tsx\n${codeSnippet}\n\`\`\``;
    });

    return `=== RELEVANT DESIGN PATTERNS ===\n${sections.join('\n\n')}\n=== END PATTERNS ===`;
  }
}
