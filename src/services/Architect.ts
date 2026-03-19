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
  static async plan(
    prompt: string,
    memoryFormatted: string,
    intent: Intent
  ): Promise<BuildStep[]> {
    const systemPrompt = `You are a software architect for a React + TypeScript + Tailwind web builder.

Do not write any code. Return only a JSON array of BuildStep objects.

Each BuildStep must have exactly these fields:
- order: number (starting at 1, incrementing by 1)
- description: string (plain English description of what this step does, no code)
- file_path: string (the exact file path to create or modify, e.g. "src/components/Foo.tsx")
- action: "create" | "modify" | "delete"
- requires_steps: number[] (orders of steps that must complete before this one; empty array if none)

Return ONLY a valid JSON array. No markdown fences, no explanation before or after the array.`;

    const userMessage =
      `${memoryFormatted}\n\n` +
      `USER REQUEST: ${prompt}\n\n` +
      `CLASSIFIED INTENT:\n` +
      `- Type: ${intent.type}\n` +
      `- Affected files: ${intent.affected_files.join(', ') || 'to be determined'}\n` +
      `- Needs new files: ${intent.needs_new_files}\n` +
      `- Risk: ${intent.risk}\n` +
      `- Reasoning: ${intent.reasoning}\n\n` +
      `Plan the implementation as a JSON array of BuildStep objects:`;

    try {
      const response = await platformService.callChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const data = await response.json();

      if (data.error) {
        console.error('[Architect] API error:', data.error);
        return [];
      }

      const text: string = data.content?.[0]?.text ?? '';
      const cleaned = this.extractJsonArray(text);
      const steps = JSON.parse(cleaned) as BuildStep[];

      if (!Array.isArray(steps)) return [];

      return steps
        .filter(s => s.order && s.file_path && s.action && s.description)
        .map(s => ({
          order: Number(s.order),
          description: String(s.description),
          file_path: String(s.file_path),
          action: s.action,
          requires_steps: Array.isArray(s.requires_steps)
            ? s.requires_steps.map(Number)
            : [],
        }));
    } catch (e) {
      console.error('[Architect] Failed to plan:', e);
      return [];
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
