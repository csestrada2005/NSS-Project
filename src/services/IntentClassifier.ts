import { platformService } from './PlatformService';
import type { ProjectMemory } from './ProjectMemoryService';
import { PATTERN_SUMMARY } from './patterns/registry';
import { promptNeedsServer } from '../utils/serverLogicSignals.js';

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
    | 'refactor'
    | 'question';
  affected_files: string[];
  needs_new_files: boolean;
  risk: 'low' | 'medium' | 'high';
  reasoning: string;
  requiredPatternIds?: string[];
  domain?: 'auth' | 'payments' | 'realtime' | 'forms' | 'data' | 'ui' | 'general';
  /**
   * Cuál de los cuatro caminos de default disparó, o `undefined` si la
   * clasificación fue normal. Los cuatro devuelven el MISMO DEFAULT_INTENT
   * —mismo type, mismo risk, mismo reasoning literal—, así que desde el objeto
   * retornado eran indistinguibles entre sí y de un 'modify_existing' legítimo.
   * Este marcador es la única diferencia observable; viaja hasta la columna
   * `classifier_default` de forge_intent_log (NULL = clasificación normal).
   */
  classifierDefault?: 'api_error' | 'invalid_type' | 'missing_risk' | 'parse_error';
  /**
   * Eje independiente del type: ¿esta petición necesita lógica que NO puede
   * vivir en el navegador (roles/permisos, API keys de terceros, envío de
   * email, agregación de datos, moderación de contenido)? Cualquiera de los
   * 8 types puede llevar needs_server=true.
   */
  needs_server: boolean;
  /** Una frase corta con el disparador que aplica, o '' si needs_server es false. */
  server_reason: string;
}

const DEFAULT_INTENT: Intent = {
  type: 'modify_existing',
  affected_files: [],
  needs_new_files: false,
  risk: 'medium',
  reasoning: 'Could not classify intent; using safe default.',
  requiredPatternIds: [],
  domain: 'general',
  needs_server: false,
  server_reason: '',
};

// ---------------------------------------------------------------------------
// IntentClassifier — single fast Haiku call
// ---------------------------------------------------------------------------

export class IntentClassifier {
  static async classify(
    prompt: string,
    memory: ProjectMemory,
    chatHistory: Array<{ role: string; content: string }> = [],
    signal?: AbortSignal
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

    const systemPrompt = `You MUST respond with ONLY a valid JSON object. No markdown, no explanation, no code fences. Start your response with { and end with }.\n\nYou are an intent classifier for a React web builder AI.
Given a user prompt and project context, classify the intent and return ONLY a JSON object matching this TypeScript interface:

interface Intent {
  type: 'new_feature' | 'modify_existing' | 'fix_bug' | 'style_change' | 'add_page' | 'database_change' | 'refactor' | 'question';
  affected_files: string[];   // file paths likely to be modified
  needs_new_files: boolean;
  risk: 'low' | 'medium' | 'high';
  reasoning: string;          // one sentence explanation
}

INTENT TYPE NOTES:
new_feature: The user commands adding new UI functionality or content (components, sections, forms, widgets) to the app. This includes visual elements that display data on a page.
modify_existing: The user commands changing text, content, or behavior of something that already exists in the project, without creating new pages or components.
fix_bug: The user reports something broken, failing, or behaving incorrectly and wants it repaired.
style_change: The user requests purely visual changes — colors, palette, typography, spacing, rounding, layout appearance — with no content or logic changes.
add_page: The user requests a new page or route (e.g. an about page, a menu page), including wiring its navigation link.
database_change: The user commands creating, altering, or deleting DATABASE structures or stored data: tables with columns, schemas, SQL, or migration files (supabase/migrations/), including deleting migrations. When the user asks to add "a table for X" where X is business data (reviews, orders, users, products), treat it as a DATABASE table → database_change, even though the data could also be displayed in the UI. Only classify as new_feature or modify_existing when the user explicitly asks for a visual/UI element — using words like section, component, grid, page, display, or show — that merely presents data.
refactor: The user wants code restructured, split, or de-duplicated without changing visible behavior or appearance.
question: The user is asking for information, advice, an explanation, or a recommendation — they are NOT requesting a change to the project. An instruction to build or modify something is NEVER question, even when phrased with polite question syntax ('can you add...?'). For type=question always return affected_files=[], needs_new_files=false, risk="low".

SERVER-SIDE LOGIC (independent of type — a request can be any type AND also need server logic):
Output needs_server: true when fulfilling the request requires logic that must NOT run in the user's browser. Trigger cases:
(1) assigning, changing or checking user roles/permissions/admin status; inviting, disabling or deleting users;
(2) calling any third-party API that requires a secret key (AI/LLM APIs, payment providers, email senders);
(3) sending email or notifications;
(4) aggregating, summarising or analysing stored data across many rows (reports, monthly summaries);
(5) moderating, filtering or validating user-submitted content before it is stored.
Output needs_server: false for purely visual work, content edits, page creation, refactors, questions, and for plain table creation with no logic attached.
server_reason: one short sentence naming which trigger applies, or empty string when false.

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
      const response = await platformService.callForgeChat({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 768,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }, signal);

      const data = await response.json();

      if (data.error) {
        console.warn('[IntentClassifier] API error:', data.error);
        return this.withServerBelt({ ...DEFAULT_INTENT, classifierDefault: 'api_error' }, prompt);
      }

      const text: string = data.content?.[0]?.text ?? '';
      const cleaned = this.extractJson(text);
      const parsed = JSON.parse(cleaned) as Partial<Intent>;

      const VALID_TYPES = ['fix_bug', 'style_change', 'refactor', 'new_feature', 'modify_existing', 'add_page', 'database_change', 'question'];
      if (!parsed.type || !VALID_TYPES.includes(parsed.type)) {
        console.warn('[IntentClassifier] Invalid or missing type in response:', parsed.type, '| raw text preview:', text.slice(0, 200));
        return this.withServerBelt({ ...DEFAULT_INTENT, classifierDefault: 'invalid_type' }, prompt);
      }

      if (!parsed.risk) {
        console.warn('[IntentClassifier] Missing risk in response; using safe default.');
        return this.withServerBelt({ ...DEFAULT_INTENT, classifierDefault: 'missing_risk' }, prompt);
      }

      return this.withServerBelt({
        type: parsed.type,
        affected_files: Array.isArray(parsed.affected_files) ? parsed.affected_files : [],
        needs_new_files: parsed.needs_new_files ?? false,
        risk: parsed.risk,
        reasoning: parsed.reasoning ?? '',
        requiredPatternIds: Array.isArray(parsed.requiredPatternIds) ? parsed.requiredPatternIds : [],
        domain: parsed.domain ?? 'general',
        needs_server: parsed.needs_server === true,
        server_reason: typeof parsed.server_reason === 'string' ? parsed.server_reason : '',
      }, prompt);
    } catch (e) {
      console.warn('[IntentClassifier] Failed to classify:', e);
      return this.withServerBelt({ ...DEFAULT_INTENT, classifierDefault: 'parse_error' }, prompt);
    }
  }

  /**
   * Cinturón determinista sobre needs_server (Cambio 2): OR entre lo que dijo
   * el LLM y promptNeedsServer(prompt) sobre el texto crudo. No sustituye al
   * LLM — se suma, para que needs_server siga funcionando aunque Haiku
   * devuelva error, tipo inválido, risk ausente, o un JSON que no parsea.
   * server_reason sólo se sobreescribe cuando el LLM no dio ninguna razón.
   */
  private static withServerBelt(intent: Intent, prompt: string): Intent {
    if (!promptNeedsServer(prompt)) return intent;
    return {
      ...intent,
      needs_server: true,
      server_reason: intent.server_reason || 'deterministic signal',
    };
  }

  private static extractJson(text: string): string {
    // 1. Try fenced code block first (```json ... ``` or ``` ... ```)
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();

    // 2. Try to find the outermost { } pair
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) return text.slice(start, end + 1);

    // 3. Nothing found — return empty object so JSON.parse gives {} not throws
    return '{}';
  }
}
