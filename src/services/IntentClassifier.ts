import { platformService } from './PlatformService';
import type { ProjectMemory } from './ProjectMemoryService';
import { PATTERN_SUMMARY } from './patterns/registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Intent {
  type:
    | 'new_feature'
    | 'modify_existing'
    | 'fix_bug'
    | 'style_change'
    | 'add_page'
    | 'database_change'
    | 'refactor';
  affected_files: string[];
  needs_new_files: boolean;
  risk: 'low' | 'medium' | 'high';
  reasoning: string;
  requiredPatternIds?: string[];
  domain?: 'auth' | 'payments' | 'realtime' | 'forms' | 'data' | 'ui' | 'general';
}

const DEFAULT_INTENT: Intent = {
  type: 'modify_existing',
  affected_files: [],
  needs_new_files: false,
  risk: 'medium',
  reasoning: 'Could not classify intent; using safe default.',
  requiredPatternIds: [],
  domain: 'general',
};

// ---------------------------------------------------------------------------
// IntentClassifier — single fast Haiku call
// ---------------------------------------------------------------------------

export class IntentClassifier {
  static async classify(
    prompt: string,
    memory: ProjectMemory,
    chatHistory: Array<{ role: string; content: string }> = []
  ): Promise<Intent> {
    const registrySummary = memory.component_registry
      .slice(0, 20)
      .map(c => `${c.name} (${c.path})`)
      .join(', ');

    const routeSummary = memory.route_map
      .map(r => `${r.path} → ${r.component}`)
      .join(', ');

    const recentHistory = chatHistory
      .slice(-4)
      .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n');

    const systemPrompt = `You are an intent classifier for a React web builder AI.
Given a user prompt and project context, classify the intent and return ONLY a JSON object matching this TypeScript interface:

interface Intent {
  type: 'new_feature' | 'modify_existing' | 'fix_bug' | 'style_change' | 'add_page' | 'database_change' | 'refactor';
  affected_files: string[];   // file paths likely to be modified
  needs_new_files: boolean;
  risk: 'low' | 'medium' | 'high';
  reasoning: string;          // one sentence explanation
}

Return ONLY valid JSON. No markdown fences, no explanation outside the JSON object.

AVAILABLE ARCHITECTURE PATTERNS: ${PATTERN_SUMMARY}

Additionally output these two fields in your JSON response:
* requiredPatternIds: string[] — select at most 3 pattern IDs from the list above that are most relevant to the user's request. If none apply, return an empty array. Only use IDs exactly as listed above. Do not invent IDs.
* domain: one of 'auth' | 'payments' | 'realtime' | 'forms' | 'data' | 'ui' | 'general'`;

    const userMessage =
      `COMPONENT REGISTRY: ${registrySummary || 'none'}\n` +
      `ROUTES: ${routeSummary || 'none'}\n` +
      (recentHistory ? `RECENT CHAT HISTORY:\n${recentHistory}\n` : '') +
      `USER PROMPT: ${prompt}`;

    try {
      const response = await platformService.callChat({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 768,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const data = await response.json();

      if (data.error) {
        console.warn('[IntentClassifier] API error:', data.error);
        return DEFAULT_INTENT;
      }

      const text: string = data.content?.[0]?.text ?? '';
      const cleaned = this.extractJson(text);
      const parsed = JSON.parse(cleaned) as Partial<Intent>;

      if (!parsed.type || !parsed.risk) {
        return DEFAULT_INTENT;
      }

      return {
        type: parsed.type,
        affected_files: Array.isArray(parsed.affected_files) ? parsed.affected_files : [],
        needs_new_files: parsed.needs_new_files ?? false,
        risk: parsed.risk,
        reasoning: parsed.reasoning ?? '',
        requiredPatternIds: Array.isArray(parsed.requiredPatternIds) ? parsed.requiredPatternIds : [],
        domain: parsed.domain ?? 'general',
      };
    } catch (e) {
      console.warn('[IntentClassifier] Failed to classify:', e);
      return DEFAULT_INTENT;
    }
  }

  private static extractJson(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) return text.slice(start, end + 1);
    return text.trim();
  }
}
