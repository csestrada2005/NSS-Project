import type { BuildStep } from './Architect';
import type { ProjectMemory } from './ProjectMemoryService';
import { SupabaseService } from './SupabaseService';
import { sanitizeFileContent } from '../utils/sanitizeFileContent';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProgressCallback = (
  stepNumber: number,
  totalSteps: number,
  currentFile: string
) => void;

/**
 * Result of executing a build plan. Beyond the produced files, it carries an
 * honest account of what did NOT get built so the caller can report partial
 * success instead of silently shipping a half-finished project.
 */
export interface ImplementerResult {
  files: Map<string, string>;
  /** Steps whose API call failed definitively after all retries. */
  failedSteps: { step: BuildStep; reason: string }[];
  /** Steps never attempted because a dependency failed (cascade). */
  skippedSteps: BuildStep[];
}

// ---------------------------------------------------------------------------
// Prompts (mirrors AIOrchestrator rules for consistency)
// ---------------------------------------------------------------------------

const FORMAT_INSTRUCTION = `
CRITICAL OUTPUT FORMAT: Respond with ONLY the complete file content.
No markdown fences, no explanation before or after. Just the raw file content starting from line 1.
Never truncate. Never use placeholder comments like "// rest of file here".
Never write the file path as the first line of the file content. File content must start directly with code (imports, comments, or declarations).
When importing components created by other steps of this plan, use the EXACT paths listed under PLAN FILES (with the @/ alias). Never guess paths.
Never reimplement inline a component that exists as a file in PLAN FILES — import it instead.
`.trim();

const REACT_TAILWIND_RULES = `
REACT/TAILWIND RULES:
- Always write complete file contents, never partial updates
- Preserve all existing data-oid attributes exactly — never add, remove, or change them
- Prefer Tailwind utility classes; avoid inline styles unless position math requires it
- Follow existing file structure and import patterns visible in context
- Supabase: import { SupabaseService } from '@/services/SupabaseService'; const supabase = SupabaseService.getInstance().client;
- The global CSS entry file is ALWAYS src/index.css. Never import globals.css, global.css, or any other CSS filename. Never create a new CSS entry file.
- For conditional or merged classNames, import cn from '@/lib/utils' (already provided, dependency-free). Never import clsx directly.
- When importing cn from '@/lib/utils', use a named import: import { cn } from '@/lib/utils'.
- For icons, you may import from lucide-react (e.g. import { Rocket } from 'lucide-react') or use inline <svg>.

AVAILABLE RUNTIME (the preview resolves these — use them for richer UI):
- Locally bundled (fastest, always prefer): react, react-dom, react-router-dom,
  lucide-react (icons), clsx, tailwind-merge. For classNames use
  import { cn } from '@/lib/utils' (named import).
- Any other well-known npm package (framer-motion, class-variance-authority,
  date-fns, recharts, zustand, etc.) resolves automatically via CDN at compile
  time. Prefer popular, browser-compatible packages.
- NEVER import Node-only modules (fs, path, http, express) or packages that
  require a server — the preview runs entirely in the browser.
- For animations, framer-motion is available and encouraged for hero sections,
  transitions, and micro-interactions.

NAVIGATION CONTRACT (navbar/menu/footer links must resolve — steps are generated
separately, so anchors and routes only work if both ends exist):
- Every navbar/menu/footer navigation entry MUST point to EITHER:
  (a) a route that exists in this build plan — use react-router <Link to="...">, OR
  (b) an anchor #id that a section IN THIS SAME PLAN declares.
- Every top-level page section MUST declare a short semantic id on its outermost
  element, matching its navbar label lowercased: id="menu", id="about",
  id="contact", id="testimonials", etc. Verbose ids on inner elements are fine,
  but the SHORT id MUST exist on the section root.
- href="#" is FORBIDDEN. A nav entry with no real destination must not be generated.
- Never link to routes or anchors that this plan does not create.

CHROME OWNERSHIP:
- Layout.tsx is the SOLE owner of Header and Footer. It renders them exactly
  once, around <Outlet />.
- Page components (src/pages/*) and section components MUST NEVER import or
  render Header, Footer, or any <header>/<footer> landmark elements. A closing
  CTA section is fine; a <footer> tag or footer-like block (copyright, nav
  links repeated) inside a section is FORBIDDEN.
- When a provided pattern shows Header/Footer usage, apply it INSIDE
  Layout.tsx only — patterns illustrate structure, they do not license
  duplicating chrome into pages.
`.trim();

// ---------------------------------------------------------------------------
// Implementer — executes BuildSteps in dependency order
// ---------------------------------------------------------------------------

export class Implementer {
  /**
   * Reason string set by executeStep when a step fails DEFINITIVELY at the API
   * layer (after all retries). Read by execute() immediately after the awaited
   * call — the loop is sequential, so a single static slot is safe. Reset to
   * null before every executeStep call so a null return with no reason means
   * "invalid content", not "API failure".
   */
  private static lastApiFailure: string | null = null;

  static async execute(
    plan: BuildStep[],
    files: Map<string, string>,
    memory: ProjectMemory,
    onProgress?: ProgressCallback,
    patternContext?: string,
    designContext?: string
  ): Promise<ImplementerResult> {
    const modifiedFiles = new Map<string, string>(files);
    const completed = new Set<number>();
    // `failed` holds both API-failed steps AND cascade-skipped steps, so the
    // dependency loop can distinguish "failed" from "still pending" and
    // propagate the cascade to downstream dependents.
    const failed = new Set<number>();
    const failedSteps: { step: BuildStep; reason: string }[] = [];
    const skippedSteps: BuildStep[] = [];
    const sorted = [...plan].sort((a, b) => a.order - b.order);

    console.log('[Implementer] PLAN:', JSON.stringify(
      sorted.map(s => ({ order: s.order, action: s.action,
        file_path: s.file_path, requires: s.requires_steps }))));

    // Process with dependency ordering — iterate until all resolved or no progress
    const maxPasses = plan.length * 2;
    let pass = 0;

    while (completed.size + failed.size < sorted.length && pass < maxPasses) {
      pass++;
      let progressed = false;

      for (const step of sorted) {
        if (completed.has(step.order) || failed.has(step.order)) continue;

        // Cascade: a step depending on any failed step can never run. Mark it
        // skipped AND failed so its own dependents cascade too.
        const depFailed = step.requires_steps.some(dep => failed.has(dep));
        if (depFailed) {
          console.warn('[Implementer] STEP SKIPPED (dependency failed):',
            step.order, step.file_path);
          skippedSteps.push(step);
          failed.add(step.order);
          progressed = true;
          continue;
        }

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

        const planFiles = sorted.map(s => ({
          path: s.file_path,
          done: completed.has(s.order),
        }));

        this.lastApiFailure = null;
        const newContent = await this.executeStep(step, modifiedFiles, memory, planFiles, patternContext, designContext);
        if (newContent !== null) {
          modifiedFiles.set(step.file_path, newContent);
          completed.add(step.order);
        } else if (this.lastApiFailure) {
          // Definitive API failure — do NOT mark completed; record the reason
          // and add to `failed` so dependents cascade into skippedSteps.
          console.warn('[Implementer] STEP FAILED (API):',
            step.order, step.file_path, this.lastApiFailure);
          failedSteps.push({ step, reason: this.lastApiFailure });
          failed.add(step.order);
        } else {
          // Pre-existing branch: null from invalid content (not an API failure).
          // Preserve today's behavior — treat as completed, no partial report.
          console.warn('[Implementer] STEP RETURNED NULL:', step.order, step.file_path);
          completed.add(step.order);
        }
        progressed = true;
      }

      if (!progressed) break;
    }

    if (completed.size + failed.size < sorted.length) {
      console.warn('[Implementer] UNEXECUTED STEPS (dep deadlock?):',
        sorted.filter(s => !completed.has(s.order) && !failed.has(s.order)).map(s => s.order));
    }

    if (failedSteps.length > 0) {
      console.warn('[Implementer] FAILED STEPS:',
        failedSteps.map(f => ({ order: f.step.order, file: f.step.file_path, reason: f.reason })));
    }
    if (skippedSteps.length > 0) {
      console.warn('[Implementer] SKIPPED STEPS (cascade):',
        skippedSteps.map(s => ({ order: s.order, file: s.file_path })));
    }

    console.log('[Implementer] FINAL FILE KEYS:', [...modifiedFiles.keys()]);

    return { files: modifiedFiles, failedSteps, skippedSteps };
  }

  private static truncateFileContent(content: string, maxChars = 18000): string {
    if (content.length <= maxChars) return content;
    const lines = content.split('\n');
    // Always preserve imports (first block) and export signatures (last 30 lines)
    const importLines = lines.filter(l => l.startsWith('import '));
    const bodyLines = lines.filter(l => !l.startsWith('import '));
    const importBlock = importLines.join('\n');
    const tailBlock = bodyLines.slice(-30).join('\n');
    const budget = maxChars - importBlock.length - tailBlock.length - 100;
    const midBlock = bodyLines.slice(0, Math.floor(budget / 50)).join('\n');
    return `${importBlock}\n\n${midBlock}\n\n// ... (middle truncated for context budget) ...\n\n${tailBlock}`;
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
    planFiles: { path: string; done: boolean }[],
    patternContext: string = '',
    designContext: string = ''
  ): Promise<string | null> {
    console.log('[Implementer] patternContext chars:', patternContext?.length ?? 0, '| preview:', patternContext?.slice(0, 200)); // TODO: remove after RAG verification
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
    const trimmedContent  = this.truncateFileContent(rawContent, fileBudget);

    const systemPrompt =
      `You are an expert React + TypeScript engineer implementing one specific step in a build plan.\n` +
      `${FORMAT_INSTRUCTION}\n\n` +
      `${REACT_TAILWIND_RULES}`;

    const parts: string[] = [];
    parts.push(compactMemory);
    parts.push(`STEP ${step.order}: ${step.description}`);
    parts.push(`ACTION: ${step.action}`);
    parts.push(`FILE: ${step.file_path}`);

    if (planFiles.length > 0) {
      const planList = planFiles
        .map(f => `- ${f.path} (${f.done ? 'done' : 'pending'})`)
        .join('\n');
      parts.push(
        `\nPLAN FILES (all files created/modified by this build plan):\n${planList}`
      );
    }

    if (designContext) {
      parts.push(`\nDESIGN SYSTEM CONTEXT:\n${designContext}`);
    }

    if (trimmedPattern) {
      parts.push(
        `\nREFERENCE PATTERNS (use these as structural guidance, do not copy verbatim):\n${trimmedPattern}`
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

    const result = await this.callStepWithRetry({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    if ('finalError' in result) {
      console.error(
        `[Implementer] Step ${step.order} failed definitively:`,
        result.finalError
      );
      // Publish the reason so execute() classifies this null as an API failure
      // (see Implementer.lastApiFailure). Returns null COMO HOY.
      this.lastApiFailure = result.finalError;
      return null;
    }

    const text: string = result.data.content?.[0]?.text ?? '';
    return sanitizeFileContent(this.stripCodeFences(text));
  }

  // -------------------------------------------------------------------------
  // Resilient step call — retry with exponential backoff + jitter.
  //
  // Anthropic 529 (overloaded) and transient network/timeout errors during a
  // single step used to kill it silently. This helper retries the step's chat
  // call up to 3 times before giving up, and returns a structured result so the
  // caller can record WHY a step failed instead of dropping it on the floor.
  //
  // NOTE: this does its own fetch to /api/chat-forge (rather than going through
  // PlatformService.callForgeChat) for two reasons: (1) it needs a per-attempt
  // AbortSignal.timeout on the fetch, and (2) it must attach the chaos-testing
  // header ONLY here — never on the global PlatformService path.
  // -------------------------------------------------------------------------
  private static async callStepWithRetry(
    body: object
  ): Promise<{ data: any } | { finalError: string }> {
    const MAX_ATTEMPTS = 3;
    const RETRYABLE_STATUS = new Set([429, 500, 503, 529]);
    const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 413]);
    const NON_RETRYABLE_ERROR_TYPES = new Set([
      'invalid_request_error',
      'authentication_error',
    ]);
    const RETRYABLE_ERROR_TYPES = new Set(['overloaded_error', 'api_error']);

    let lastReason = 'unknown error';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let retryable = false;

      try {
        const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Authorization,
          'anthropic-version': '2023-06-01',
        };

        // --- Chaos hook (PIEZA 4) -------------------------------------------
        // Double lock: the server only honors the header when FORGE_CHAOS_ENABLED
        // is set (see server.js). Client side, we only attach it while
        // localStorage 'forge_chaos_529' holds a positive counter, decrementing
        // once per call it's attached to — so a value of N kills exactly the
        // next N step calls (N=3 kills all 3 attempts of the first step).
        try {
          const raw = localStorage.getItem('forge_chaos_529');
          const remaining = raw ? parseInt(raw, 10) : 0;
          if (Number.isFinite(remaining) && remaining > 0) {
            headers['x-forge-chaos'] = 'overloaded';
            localStorage.setItem('forge_chaos_529', String(remaining - 1));
          }
        } catch {
          // no localStorage (SSR/tests) — chaos simply inert
        }

        const response = await fetch('/api/chat-forge', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90_000),
        });

        if (!response.ok) {
          const status = response.status;
          lastReason = `HTTP ${status}`;
          if (NON_RETRYABLE_STATUS.has(status)) {
            return { finalError: lastReason };
          }
          if (!RETRYABLE_STATUS.has(status)) {
            // Unlisted status — treat as non-retryable to fail fast.
            return { finalError: lastReason };
          }
          retryable = true; // 429/500/503/529
        } else {
          const data = await response.json();
          if (data.error) {
            const type: string = data.error.type ?? 'unknown';
            lastReason = `error:${type}`;
            if (NON_RETRYABLE_ERROR_TYPES.has(type)) {
              return { finalError: lastReason };
            }
            if (RETRYABLE_ERROR_TYPES.has(type)) {
              retryable = true;
            } else {
              // Unknown error type — fail fast rather than burn retries.
              return { finalError: lastReason };
            }
          } else {
            return { data };
          }
        }
      } catch (e: any) {
        // fetch throw (network / TypeError) or AbortSignal.timeout — retryable.
        const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        lastReason = isTimeout ? 'timeout' : `network:${e?.message ?? 'fetch failed'}`;
        retryable = true;
      }

      if (retryable && attempt < MAX_ATTEMPTS) {
        console.warn(`[Implementer] Step retry ${attempt}/3 tras ${lastReason}`);
        const backoff = 1500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    return { finalError: lastReason };
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
