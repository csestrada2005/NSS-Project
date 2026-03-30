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
    onProgress?: ProgressCallback,
    patternContext: string = ''
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

        const newContent = await this.executeStep(step, modifiedFiles, memory, patternContext);
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

  private static truncateFileContent(
    content: string,
    filePath: string,
    budgetChars: number
  ): string {
    if (content.length <= budgetChars) return content;

    const lines = content.split('\n');

    // Collect preserved top: imports, interfaces, type declarations
    const preservedTop: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (
        line.startsWith('import ') ||
        line.startsWith('export type') ||
        line.startsWith('export interface') ||
        line.startsWith('type ') ||
        line.startsWith('interface ') ||
        line.trim() === ''
      ) {
        preservedTop.push(line);
        i++;
      } else {
        break;
      }
    }

    // Capture the first non-empty line after the import block
    // (usually the component/function signature)
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i < lines.length) {
      preservedTop.push(lines[i]);
      i++;
    }

    // Always preserve the last 30 lines (closing JSX, exports)
    const tailStart = Math.max(i, lines.length - 30);
    const preservedBottom = lines.slice(tailStart);

    const topStr = preservedTop.join('\n');
    const bottomStr = preservedBottom.join('\n');
    const remaining = budgetChars - topStr.length - bottomStr.length - 80;

    if (remaining <= 0) {
      return (
        topStr +
        '\n\n// ... [body omitted for context budget] ...\n\n' +
        bottomStr
      );
    }

    // Fill middle with as many lines as fit the remaining budget
    const middleLines: string[] = [];
    let used = 0;
    for (let j = i; j < tailStart; j++) {
      const line = lines[j] + '\n';
      if (used + line.length > remaining) {
        middleLines.push(
          `// ... [${tailStart - j} lines omitted for context budget] ...`
        );
        break;
      }
      middleLines.push(lines[j]);
      used += line.length;
    }

    return topStr + '\n' + middleLines.join('\n') + '\n' + bottomStr;
  }

  private static allocateBudget(
    patternContext: string,
    importedContext: string,
    fileContent: string
  ): { patternBudget: number; importBudget: number; fileBudget: number } {
    const TOTAL_BUDGET   = 28_000;
    const SYSTEM_RESERVE = 2_000;
    const MEMORY_MAX     = 3_500;
    const PATTERN_MAX    = 7_000;
    const IMPORT_MAX     = 1_200;
    const FILE_MAX = TOTAL_BUDGET - SYSTEM_RESERVE - MEMORY_MAX - PATTERN_MAX - IMPORT_MAX;

    return {
      patternBudget: Math.min(patternContext.length, PATTERN_MAX),
      importBudget:  Math.min(importedContext.length, IMPORT_MAX),
      fileBudget:    Math.min(fileContent.length, FILE_MAX),
    };
  }

  private static async executeStep(
    step: BuildStep,
    files: Map<string, string>,
    memory: ProjectMemory,
    patternContext: string = ''
  ): Promise<string | null> {
    const rawContent      = files.get(step.file_path) ?? '';
    const importedContext = this.getImportedFileContext(rawContent, files);
    const compactMemory   = this.buildCompactMemory(memory);

    const { patternBudget, importBudget, fileBudget } = this.allocateBudget(
      patternContext,
      importedContext,
      rawContent
    );

    const trimmedPattern  = patternContext.slice(0, patternBudget);
    const trimmedImports  = importedContext.slice(0, importBudget);
    const trimmedContent  = this.truncateFileContent(rawContent, step.file_path, fileBudget);

    const systemPrompt =
      `You are an expert React + TypeScript engineer implementing one specific step in a build plan.\n` +
      `${FORMAT_INSTRUCTION}\n\n` +
      `${REACT_TAILWIND_RULES}`;

    const parts: string[] = [];
    parts.push(compactMemory);
    parts.push(`STEP ${step.order}: ${step.description}`);
    parts.push(`ACTION: ${step.action}`);
    parts.push(`FILE: ${step.file_path}`);

    if (trimmedPattern) {
      parts.push(
        `\nRELEVANT DESIGN PATTERNS:\n${trimmedPattern}\n` +
        `Use these as a structural reference if they match this step.`
      );
    }

    if (trimmedImports) {
      parts.push(`\nIMPORTED FILES CONTEXT:\n${trimmedImports}`);
    }

    if (trimmedContent) {
      parts.push(`\nCURRENT FILE CONTENT:\n${trimmedContent}`);
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
    let totalChars = 0;

    while ((m = importRegex.exec(fileContent)) !== null) {
      const rawPath = m[2];
      const prefix = m[1] === '@/' ? 'src/' : '';

      for (const ext of ['.tsx', '.ts', '.jsx', '.js', '']) {
        const candidate = rawPath.includes('.')
          ? `${prefix}${rawPath}`
          : `${prefix}${rawPath}${ext}`;

        if (files.has(candidate)) {
          const contentSnippet = files.get(candidate)!.slice(0, 400);
          const partStr = `--- ${candidate} ---\n${contentSnippet}`;

          if (totalChars + partStr.length > 1200) {
            break;
          }
          parts.push(partStr);
          totalChars += partStr.length;
          break;
        }
      }

      if (totalChars >= 1200) break;
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
