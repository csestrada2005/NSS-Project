import { SupabaseService } from './SupabaseService';

interface PatternRow {
  name: string;
  category: string;
  description: string;
  code_example: string;
}

export class PatternRetriever {
  public static async retrieve(query: string, limit = 4): Promise<string> {
    try {
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
        return '';
      }

      const data = (await response.json()) as { patterns?: PatternRow[] };
      const patterns = data.patterns ?? [];

      if (patterns.length === 0) {
        return '';
      }

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
    } catch (err) {
      console.error('[PatternRetriever]', err);
      return '';
    }
  }
}
