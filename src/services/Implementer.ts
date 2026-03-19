import { platformService } from './PlatformService';
import type { BuildStep } from './Architect';
import type { ProjectMemory } from './ProjectMemoryService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProgressCallback = (
  stepNumber: number,
  totalSteps: number,
  currentFile: string
) => void;

// ---------------------------------------------------------------------------
// Prompts (mirrors AIOrchestrator rules for consistency)
// ---------------------------------------------------------------------------

const FORMAT_INSTRUCTION = `
CRITICAL OUTPUT FORMAT: Respond with ONLY the complete file content.
No markdown fences, no explanation before or after. Just the raw file content starting from line 1.
Never truncate. Never use placeholder comments like "// rest of file here".
`.trim();

const REACT_TAILWIND_RULES = `
REACT/TAILWIND RULES:
- Always write complete file contents, never partial updates
- Preserve all existing data-oid attributes exactly — never add, remove, or change them
- Prefer Tailwind utility classes; avoid inline styles unless position math requires it
- Follow existing file structure and import patterns visible in context
- Supabase: import { SupabaseService } from '@/services/SupabaseService'; const supabase = SupabaseService.getInstance().client;
`.trim();

// ---------------------------------------------------------------------------
// Implementer — executes BuildSteps in dependency order
// ---------------------------------------------------------------------------

export class Implementer {
  static async execute(
    plan: BuildStep[],
    files: Map<string, string>,
    memory: ProjectMemory,
    onProgress?: ProgressCallback
  ): Promise<Map<string, string>> {
    const modifiedFiles = new Map<string, string>(files);
    const completed = new Set<number>();
    const sorted = [...plan].sort((a, b) => a.order - b.order);

    // Process with dependency ordering — iterate until all done or no progress
    const maxPasses = plan.length * 2;
    let pass = 0;

    while (completed.size < sorted.length && pass < maxPasses) {
      pass++;
      let progressed = false;

      for (const step of sorted) {
        if (completed.has(step.order)) continue;

        // Only proceed if all dependencies are complete
        const depsReady = step.requires_steps.every(dep => completed.has(dep));
        if (!depsReady) continue;

        onProgress?.(completed.size + 1, sorted.length, step.file_path);

        if (step.action === 'delete') {
          modifiedFiles.delete(step.file_path);
          completed.add(step.order);
          progressed = true;
          continue;
        }

        const newContent = await this.executeStep(step, modifiedFiles, memory);
        if (newContent !== null) {
          modifiedFiles.set(step.file_path, newContent);
        }
        completed.add(step.order);
        progressed = true;
      }

      if (!progressed) break;
    }

    return modifiedFiles;
  }

  private static async executeStep(
    step: BuildStep,
    files: Map<string, string>,
    memory: ProjectMemory
  ): Promise<string | null> {
    const currentContent = files.get(step.file_path) ?? '';
    const importedContext = this.getImportedFileContext(currentContent, files);
    const compactMemory = this.buildCompactMemory(memory);

    const systemPrompt =
      `You are an expert React + TypeScript engineer implementing one specific step in a build plan.\n` +
      `${FORMAT_INSTRUCTION}\n\n` +
      `${REACT_TAILWIND_RULES}`;

    const parts: string[] = [];
    parts.push(compactMemory);
    parts.push(`STEP ${step.order}: ${step.description}`);
    parts.push(`ACTION: ${step.action}`);
    parts.push(`FILE: ${step.file_path}`);

    if (importedContext) {
      parts.push(`\nIMPORTED FILES CONTEXT:\n${importedContext}`);
    }

    if (currentContent) {
      parts.push(`\nCURRENT FILE CONTENT:\n${currentContent}`);
    }

    parts.push(
      `\nWrite the complete ${step.action === 'create' ? 'new' : 'updated'} content for ${step.file_path}:`
    );

    const userMessage = parts.join('\n');

    try {
      const response = await platformService.callChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const data = await response.json();

      if (data.error) {
        console.error(`[Implementer] Step ${step.order} API error:`, data.error);
        return null;
      }

      const text: string = data.content?.[0]?.text ?? '';
      return this.stripCodeFences(text);
    } catch (e) {
      console.error(`[Implementer] Step ${step.order} failed:`, e);
      return null;
    }
  }

  // Look up the files that the given source imports from — provides LLM with
  // type signatures and patterns so it can generate compatible code.
  private static getImportedFileContext(
    fileContent: string,
    files: Map<string, string>
  ): string {
    if (!fileContent) return '';

    const importRegex = /from\s+['"](@\/|\.\.?\/)([\w/.-]+)['"]/g;
    const parts: string[] = [];
    let m: RegExpExecArray | null;

    while ((m = importRegex.exec(fileContent)) !== null) {
      const rawPath = m[2];
      const prefix = m[1] === '@/' ? 'src/' : '';

      for (const ext of ['.tsx', '.ts', '.jsx', '.js', '']) {
        const candidate = rawPath.includes('.')
          ? `${prefix}${rawPath}`
          : `${prefix}${rawPath}${ext}`;

        if (files.has(candidate)) {
          parts.push(`--- ${candidate} ---\n${files.get(candidate)!.slice(0, 800)}`);
          break;
        }
      }

      if (parts.length >= 3) break; // cap at 3 imports to keep context size reasonable
    }

    return parts.join('\n');
  }

  // Compact memory subset: just component registry + conventions
  private static buildCompactMemory(memory: ProjectMemory): string {
    const lines: string[] = ['=== CONTEXT ==='];
    const conv = memory.code_conventions;
    lines.push(
      `Conventions: tailwind=${conv.uses_tailwind}, cn()=${conv.uses_cn}, alias=${conv.import_alias ?? 'none'}`
    );

    if (memory.component_registry.length > 0) {
      lines.push('Components:');
      for (const c of memory.component_registry.slice(0, 20)) {
        lines.push(`  ${c.name} → ${c.path}`);
      }
    }

    lines.push('=== END CONTEXT ===');
    return lines.join('\n');
  }

  private static stripCodeFences(text: string): string {
    const fenced = text.match(/```(?:tsx?|jsx?|typescript|javascript)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    return text.trim();
  }
}
