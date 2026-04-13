import { platformService } from './PlatformService';
import type { Intent } from './IntentClassifier';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildStep {
  order: number;
  description: string;
  file_path: string;
  action: 'create' | 'modify' | 'delete';
  requires_steps: number[];
}

// ---------------------------------------------------------------------------
// Architect — plans implementation without writing any code
// ---------------------------------------------------------------------------

export class Architect {
  private static sanitizeJson(raw: string): string {
    // Remove raw control characters that break JSON (tabs and newlines inside string values)
    // We do a targeted approach: replace literal newlines/tabs only inside JSON string values
    let result = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        result += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        result += ch;
        continue;
      }
      if (inString && (ch === '\n' || ch === '\r')) {
        result += ' ';
        continue;
      }
      if (inString && ch === '\t') {
        result += ' ';
        continue;
      }
      result += ch;
    }
    return result;
  }

  static async plan(
    prompt: string,
    memoryFormatted: string,
    intent: Intent,
    designContext?: string
  ): Promise<{ steps: BuildStep[]; wasTrimmed: boolean; originalCount: number }> {
    console.log('[Architect] designContext chars:', designContext?.length ?? 0, '| preview:', designContext?.slice(0, 300)); // TODO: remove after RAG verification
    const systemPrompt = `You are a software architect for a React + TypeScript + Tailwind web builder.
Do not write any code. Return only a JSON array of BuildStep objects.
Each BuildStep must have exactly these fields:

order: number (starting at 1)
description: string (what the file will DO after the change, not what action you take. Bad: "Update Dashboard.tsx". Good: "Dashboard showing monthly revenue chart and active projects KPI cards")
file_path: string (exact path e.g. "src/components/Foo.tsx")
action: "create" | "modify" | "delete"
requires_steps: number[] (empty array if no dependencies)

PLANNING RULES — follow these exactly:

Maximum 6 steps for any request. If you think you need more, consolidate.
Minimum 1 step. Never return an empty array.
One step = one file. Never put two different file paths in one step.
Purely cosmetic changes (color, text, spacing): return exactly 1 step.
New page: 2-4 steps maximum (page component + sub-components + router update).
Do not create test files, story files, or documentation files unless explicitly asked.
Do not modify package.json, vite.config.ts, tsconfig.json, or any config file unless the user explicitly asks to add a dependency or change build configuration.
If the user asks to fix something, only modify files that contain the bug.
Every step description must explain what the file will contain after the change.
All description strings must be plain text only — no newlines, no backticks, no special characters.

Return ONLY a valid JSON array. No markdown fences, no explanation before or after.`;

    try {
      const designBlock = designContext ? `DESIGN SYSTEM CONTEXT:\n${designContext}\n\n` : '';
      const userMessage =
        designBlock +
        `${memoryFormatted}\n\n` +
        `USER REQUEST: ${prompt}\n\n` +
        `CLASSIFIED INTENT:\n` +
        `- Type: ${intent.type}\n` +
        `- Affected files: ${intent.affected_files.join(', ') || 'to be determined'}\n` +
        `- Needs new files: ${intent.needs_new_files}\n` +
        `- Risk: ${intent.risk}\n` +
        `- Reasoning: ${intent.reasoning}\n\n` +
        `Plan the implementation as a JSON array of BuildStep objects:`;

      const response = await platformService.callForgeChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const data = await response.json();

      if (data.error) {
        console.error('[Architect] API error:', data.error);
        return { steps: [], wasTrimmed: false, originalCount: 0 };
      }

      const text: string = data.content?.[0]?.text ?? '';
      const cleaned = this.extractJsonArray(text);
      let steps = JSON.parse(this.sanitizeJson(cleaned)) as BuildStep[];

      if (!Array.isArray(steps)) return { steps: [], wasTrimmed: false, originalCount: 0 };

      const originalCount = steps.length;
      let wasTrimmed = false;
      if (steps.length > 6) {
        steps = steps.slice(0, 6);
        wasTrimmed = true;
        console.warn(`[Architect] Plan trimmed from ${originalCount} to 6 steps`);
      }

      const filteredAndMappedSteps = steps
        .filter(s => s.file_path && s.file_path.trim() !== '')
        .map(s => {
          let desc = s.description;
          if (!desc || desc.trim() === '') {
            desc = `Update ${s.file_path}`;
          }
          return {
            order: Number(s.order),
            description: String(desc),
            file_path: String(s.file_path),
            action: s.action,
            requires_steps: Array.isArray(s.requires_steps)
              ? s.requires_steps.map(Number)
              : [],
          };
        });

      return { steps: filteredAndMappedSteps, wasTrimmed, originalCount };
    } catch (e) {
      console.error('[Architect] Failed to plan:', e);
      return { steps: [], wasTrimmed: false, originalCount: 0 };
    }
  }

  private static extractJsonArray(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) return text.slice(start, end + 1);
    return text.trim();
  }
}
