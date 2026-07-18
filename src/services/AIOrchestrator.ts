import { updateCode } from '../utils/ast';
import { sanitizeFileContent } from '../utils/sanitizeFileContent';
import { contextService } from './ContextService';
import { SupabaseService } from './SupabaseService';
import { platformService } from './PlatformService';
import { projectDBService } from './ProjectDBService';
import { NEBU_SCHEMA_CONTEXT } from '../utils/schemaContext';
import { ProjectMemoryService } from './ProjectMemoryService';
import { PatternRetriever } from './PatternRetriever';
import { DesignContextService } from './DesignContextService';
import { IntentClassifier, type Intent } from './IntentClassifier';
import type { ProjectMemory } from './ProjectMemoryService';
import { Architect, type BuildStep } from './Architect';
import { Implementer, type ProgressCallback } from './Implementer';
import { Verifier, type RetryCallback } from './Verifier';
import { CreditService } from './CreditService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ModifiedFile {
  path: string;
  newContent: string;
}

interface LLMResponse {
  modifiedFiles: ModifiedFile[];
  installCommands?: string[];
  error?: string;
}

export interface OrchestratorResult {
  modifiedFiles: string[];
  steps?: BuildStep[];
  outcome?: 'success' | 'failed';
  error?: string;
  warning?: string;
  tokensInput?: number;
  tokensOutput?: number;
  chatResponse?: string;
  suggestedAction?: string;
  /**
   * Simple-lane targeting asked the user to disambiguate instead of editing.
   * Only used to append a telemetry suffix to the logged prompt — no DB column.
   */
  clarifyAsked?: boolean;
}

// ---------------------------------------------------------------------------
// File relevance scoring — used by the legacy heavy lane and plan steps
// ---------------------------------------------------------------------------

function selectRelevantFiles(
  userMessage: string,
  files: Map<string, string>
): { path: string; content: string }[] {
  const keywords = userMessage
    .split(/[\s\p{P}]+/u)
    .map(w => w.toLowerCase())
    .filter(w => w.length > 3);

  const scored: { path: string; content: string; score: number }[] = [];

  for (const [path, content] of files) {
    if (
      path.includes('node_modules') ||
      path.includes('dist/') ||
      !path.startsWith('src/') ||
      (!path.endsWith('.tsx') &&
        !path.endsWith('.ts') &&
        !path.endsWith('.jsx') &&
        !path.endsWith('.js'))
    ) continue;

    const nameLower = path.toLowerCase();
    const contentSnippet = content.slice(0, 2000).toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (nameLower.includes(kw)) score += 3;
      if (contentSnippet.includes(kw)) score += 1;
    }
    scored.push({ path, content, score });
  }

  scored.sort((a, b) => b.score - a.score);

  // Zero-score fallback: when no keyword matched anything, a vague UI edit
  // should land on the rendered page rather than a service or config file.
  if (scored.length > 0 && scored[0].score === 0) {
    const preferred =
      scored.find(f => f.path === 'src/pages/Index.tsx') ??
      scored.find(f => f.path === 'src/App.tsx') ??
      scored.find(f => f.path.endsWith('.tsx'));
    if (preferred) {
      const rest = scored.filter(f => f !== preferred);
      scored.length = 0;
      scored.push(preferred, ...rest);
    }
  }

  return scored.slice(0, 5).map(f => ({ path: f.path, content: f.content.slice(0, 3000) }));
}

/**
 * Tercera fuente determinista de candidatos para el targeting del simple lane:
 * los archivos importados estáticamente por las páginas ruteadas (+ App.tsx).
 * Estos son los componentes que realmente pintan la UI — creados por el
 * Implementer después del scaffold — y que el scoring por keywords nunca hace
 * subir cuando el prompt no contiene sus nombres (p. ej. un prompt en español).
 *
 * Función pura, sin llamadas de red, un único nivel de profundidad (imports de
 * las páginas, no recursivo). La extracción de cada archivo va envuelta en
 * try/catch: un archivo con contenido raro nunca rompe el targeting.
 */
function getPageImportFiles(files: Map<string, string>): string[] {
  // Mismo filtro de directorio/extensión que selectRelevantFiles.
  const passesFilter = (path: string): boolean => {
    if (path.includes('node_modules') || path.includes('dist/')) return false;
    if (!path.startsWith('src/')) return false;
    return (
      path.endsWith('.tsx') ||
      path.endsWith('.ts') ||
      path.endsWith('.jsx') ||
      path.endsWith('.js')
    );
  };

  // Archivos semilla: páginas ruteadas + App.tsx si existe.
  const seeds: string[] = [];
  for (const path of files.keys()) {
    if (path.startsWith('src/pages/') && path.endsWith('.tsx')) seeds.push(path);
  }
  if (files.has('src/App.tsx')) seeds.push('src/App.tsx');

  const importRe = /import\s+[^'"]*from\s+['"]([^'"]+)['"]/g;
  const result: string[] = [];
  const seen = new Set<string>();

  for (const seed of seeds) {
    try {
      const content = files.get(seed) ?? '';
      const seedDir = seed.slice(0, seed.lastIndexOf('/')); // p. ej. 'src/pages'

      importRe.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = importRe.exec(content)) !== null) {
        const spec = match[1];
        let base: string | null = null;

        if (spec.startsWith('@/')) {
          base = 'src/' + spec.slice(2);
        } else if (spec.startsWith('./') || spec.startsWith('../')) {
          // Resolver relativo al directorio de la semilla, normalizando '..'.
          const parts = seedDir.split('/');
          for (const seg of spec.split('/')) {
            if (seg === '' || seg === '.') continue;
            if (seg === '..') { parts.pop(); continue; }
            parts.push(seg);
          }
          base = parts.join('/');
        } else {
          continue; // paquete npm — ignorar
        }

        if (!base) continue;

        // Probar sufijos: tal cual, +'.tsx', +'.ts', +'/index.tsx'.
        for (const suffix of ['', '.tsx', '.ts', '/index.tsx']) {
          const candidate = base + suffix;
          if (files.has(candidate) && passesFilter(candidate) && !seen.has(candidate)) {
            seen.add(candidate);
            result.push(candidate);
            break;
          }
        }
      }
    } catch {
      // Un archivo problemático nunca rompe el targeting.
    }
  }

  return result;
}

function generateBlueprintFromFiles(files: Map<string, string>): string {
  return Array.from(files.keys())
    .filter(p => !p.includes('node_modules') && !p.includes('dist/'))
    .sort()
    .join('\n');
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const FORMAT_INSTRUCTION = `
CRITICAL OUTPUT FORMAT: Respond with ONLY a raw JSON object. No markdown. No code fences. No explanation before or after. The object must have this exact shape:
{"modifiedFiles":[{"path":"src/components/Foo.tsx","newContent":"...full file content..."}],"installCommands":[]}
If you cannot fulfill the request, respond with: {"modifiedFiles":[],"installCommands":[],"error":"reason"}
Never truncate file content. Never use placeholder comments like "// rest of file here".
`;

const AVAILABLE_RUNTIME_CONTEXT =
  'AVAILABLE RUNTIME (the preview resolves these — use them for richer UI):\n' +
  '- Locally bundled (fastest, always prefer): react, react-dom, react-router-dom,\n' +
  '  lucide-react (icons), clsx, tailwind-merge. For classNames use\n' +
  "  import { cn } from '@/lib/utils' (named import).\n" +
  '- Any other well-known npm package (framer-motion, class-variance-authority,\n' +
  '  date-fns, recharts, zustand, etc.) resolves automatically via CDN at compile\n' +
  '  time. Prefer popular, browser-compatible packages.\n' +
  '- NEVER import Node-only modules (fs, path, http, express) or packages that\n' +
  '  require a server — the preview runs entirely in the browser.\n' +
  '- For animations, framer-motion is available and encouraged for hero sections,\n' +
  '  transitions, and micro-interactions.';

const REACT_TAILWIND_RULES = `
REACT/TAILWIND RULES:
- Always write complete file contents, never partial updates
- Use data-oid attributes exactly as they exist in the source — never add, remove, or change them
- Prefer Tailwind utility classes; avoid inline styles unless position:absolute math requires it
- For new components, follow the existing file structure and import patterns visible in the provided context
- Supabase queries: import via \`import { SupabaseService } from '@/services/SupabaseService'; const supabase = SupabaseService.getInstance().client;\`
`;

const BACKEND_RULES = `When the user asks for backend features (e.g., 'save this to the database' or 'create a user profile table'), you must perform a 3-step process:
1. Generate a valid PostgreSQL CREATE TABLE statement wrapped in a file named \`supabase/migrations/<timestamp>_create_<table_name>.sql\`.
2. Update or create \`src/integrations/supabase/types.ts\` to include the TypeScript interface for the new table.
   Example for types.ts:
   export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
   export interface Database {
     public: {
       Tables: {
         profiles: {
           Row: { id: string; created_at: string; username: string | null; }
           Insert: { id: string; created_at?: string; username?: string | null; }
           Update: { id?: string; created_at?: string; username?: string | null; }
         }
       }
     }
   }
3. Create a custom hook \`src/hooks/use<Entity>.ts\` that encapsulates the Supabase client logic (select, insert, update, delete) using the generated types.
   Example for useTodos.ts:
   import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
   import { supabase } from '../integrations/supabase/client';
   export const useTodos = () => {
     const queryClient = useQueryClient();
     const fetchTodos = async () => { const { data, error } = await supabase.from('todos').select('*'); if (error) throw error; return data; };
     const addTodo = async (todo: any) => { const { data, error } = await supabase.from('todos').insert(todo).select(); if (error) throw error; return data; };
     return { todos: useQuery({ queryKey: ['todos'], queryFn: fetchTodos }), addTodo: useMutation({ mutationFn: addTodo, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }) }) };
   };
4. Do NOT try to execute the SQL directly.
5. If the user asks to 'Mock' the data, generate a src/data.json file instead of SQL.
6. Use the \`cn()\` utility from \`src/lib/utils\` for merging Tailwind classes dynamically.
7. If the user asks for backend logic (e.g., 'handle Stripe payments' or 'Edge Function'), generate a Deno-compatible TypeScript file at \`supabase/functions/<name>/index.ts\`.
8. If you need a Shadcn component (e.g., sheet, accordion, dialog) that is not currently in the src/components/ui folder, you MUST include 'npx shadcn-ui@latest add [component-name]' in the 'installCommands' array in your JSON response.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trackAICall(projectId: string) {
  const supabase = SupabaseService.getInstance().client;
  (async () => {
    try {
      const { data } = await supabase
        .from('forge_projects')
        .select('ai_call_count')
        .eq('id', projectId)
        .single();
      await supabase
        .from('forge_projects')
        .update({
          ai_call_count: (data?.ai_call_count ?? 0) + 1,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', projectId);
    } catch {
      // non-critical
    }
  })();
}

// ---------------------------------------------------------------------------
// AIOrchestrator — wires all 5 layers + legacy plan/step commands
// ---------------------------------------------------------------------------

export class AIOrchestrator {
  private static lastModifiedFiles: string[] = [];
  private static retryCount = 0;
  private static maxRetries = 2;

  /** Callback invoked for every file the AI writes. Registered by StudioEngine. */
  private static fileUpdateCallback: ((path: string, content: string) => void) | null = null;

  static setFileUpdateCallback(cb: (path: string, content: string) => void) {
    this.fileUpdateCallback = cb;
  }

  private static notifyFileUpdate(path: string, content: string) {
    this.fileUpdateCallback?.(path, content);
  }

  // -------------------------------------------------------------------------
  // Legacy plan generation
  // -------------------------------------------------------------------------

  static async generatePlan(
    userGoal: string,
    _files: Map<string, string>
  ): Promise<{ modifiedFiles: string[] }> {
    const systemPrompt =
      'You are a Senior Technical Project Manager. Create a detailed implementation plan for the user\'s request. Output ONLY the content of a PLAN.md file. The format must be a markdown checklist.\n\n' +
      'Example:\n' +
      '- [ ] 1. Setup Database Schema\n' +
      '- [ ] 2. Create API Endpoints\n' +
      '- [ ] 3. Implement Frontend Components\n\n' +
      'Keep steps atomic, clear, and focused on code implementation.';

    const planContent = await this.callLLM(userGoal, systemPrompt);
    this.notifyFileUpdate('PLAN.md', planContent);
    return { modifiedFiles: ['PLAN.md'] };
  }

  // -------------------------------------------------------------------------
  // Legacy step execution
  // -------------------------------------------------------------------------

  static async executeNextStep(
    files: Map<string, string>
  ): Promise<{ modifiedFiles: string[] } | null> {
    this.retryCount = 0;

    const planContent = files.get('PLAN.md');
    if (!planContent) return null;

    const lines = planContent.split('\n');
    let nextStepIndex = -1;
    let nextStepDescription = '';

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('- [ ]')) {
        nextStepIndex = i;
        nextStepDescription = lines[i].replace('- [ ]', '').trim();
        break;
      }
    }

    if (nextStepIndex === -1) return null;

    const relevantFiles = selectRelevantFiles(nextStepDescription, files);
    const blueprint = generateBlueprintFromFiles(files);

    let relevantContext = '';
    for (const f of relevantFiles) {
      relevantContext += `--- START ${f.path} ---\n${f.content}\n--- END ${f.path} ---\n`;
    }

    const systemPrompt =
      NEBU_SCHEMA_CONTEXT + '\n\n' +
      'You are an expert Senior React Engineer. Implement the following step from the plan.\n' +
      FORMAT_INSTRUCTION + '\n' +
      REACT_TAILWIND_RULES + '\n' +
      BACKEND_RULES + '\n\n' +
      `Task: ${nextStepDescription}`;

    const userMessage =
      `PROJECT BLUEPRINT (File Structure):\n${blueprint}\n\n` +
      `RELEVANT FILE CONTEXT:\n${relevantContext}\n\n` +
      `USER REQUEST:\n${nextStepDescription}`;

    try {
      const rawResponse = await this.callLLM(userMessage, systemPrompt);
      const cleanJson = this.cleanJsonOutput(rawResponse);
      const response: LLMResponse = JSON.parse(cleanJson);

      const modifiedPaths: string[] = [];
      for (const file of response.modifiedFiles) {
        this.notifyFileUpdate(file.path, this.stripCodeFences(file.newContent));
        modifiedPaths.push(file.path);

        if (file.path.startsWith('supabase/functions/') && file.path.endsWith('index.ts')) {
          const parts = file.path.split('/');
          if (parts.length === 4) {
            SupabaseService.getInstance().deployEdgeFunction(parts[2], file.newContent);
          }
        }
      }

      lines[nextStepIndex] = lines[nextStepIndex].replace('- [ ]', '- [x]');
      const newPlanContent = lines.join('\n');
      this.notifyFileUpdate('PLAN.md', newPlanContent);
      modifiedPaths.push('PLAN.md');

      this.lastModifiedFiles = modifiedPaths;
      return { modifiedFiles: modifiedPaths };
    } catch (error) {
      console.error('[AIOrchestrator] Error executing step:', error);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Main command parser — wires the 5-layer agentic architecture
  // -------------------------------------------------------------------------

  private static async logIntent(params: {
    projectId: string;
    prompt: string;
    intentType?: string;
    intentRisk?: string;
    planSteps?: BuildStep[];
    modifiedFiles: string[];
    affectedFiles?: string[];
    outcome: 'success' | 'failed';
    errorMessage?: string;
    durationMs: number;
    requiredPatternIds?: string[];
    domain?: string;
  }): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('forge_intent_log').insert({
        project_id: params.projectId,
        user_id: user.id,
        user_prompt: params.prompt,
        intent_type: params.intentType,
        intent_risk: params.intentRisk,
        plan: params.planSteps ?? [],
        files_modified: params.modifiedFiles ?? [],
        affected_files: params.affectedFiles ?? [],
        outcome: params.outcome,
        error_message: params.errorMessage,
        duration_ms: params.durationMs,
        required_pattern_ids: params.requiredPatternIds ?? [],
        domain: params.domain ?? 'general',
      });
    } catch (e) {
      console.error('[AIOrchestrator] Failed to log intent:', e);
    }
  }

  static async parseUserCommand(
    input: string,
    files: Map<string, string>,
    selectedElement: { tagName: string; className?: string } | null = null,
    projectId?: string,
    onProgress?: ProgressCallback,
    onRetry?: RetryCallback,
    chatHistory?: Array<{ role: string; content: string }>
  ): Promise<OrchestratorResult> {
    this.retryCount = 0;
    const startTime = Date.now();

    // ------------------------------------------------------------------
    // Legacy shortcut commands (preserved for backward compatibility)
    // ------------------------------------------------------------------
    if (input.toLowerCase().startsWith('plan:')) {
      const result = await this.generatePlan(input.substring(5).trim(), files);
      return { modifiedFiles: result.modifiedFiles };
    }

    if (input.toLowerCase().startsWith('build a')) {
      const result = await this.generatePlan(input, files);
      return { modifiedFiles: result.modifiedFiles };
    }

    if (
      input.toLowerCase().trim() === 'execute next step' ||
      input.toLowerCase().trim() === 'continue plan'
    ) {
      const result = await this.executeNextStep(files);
      return result ? { modifiedFiles: result.modifiedFiles } : { modifiedFiles: [] };
    }

    // ------------------------------------------------------------------
    // CREDIT CHECK — must pass before any LLM call
    // ------------------------------------------------------------------
    let creditUserId: string | null = null;
    let isFreePrompt = false;
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        creditUserId = user.id;
        const creditCheck = await CreditService.canMakeCall(user.id);
        isFreePrompt = creditCheck.isFreePrompt ?? false;
      }
    } catch (e) {
      console.error('[AIOrchestrator] Credit check error:', e);
      // Fail open on credit check errors
    }

    // ------------------------------------------------------------------
    // LAYER 1 — ProjectMemoryService: get or build project memory
    // ------------------------------------------------------------------
    let memory = projectId ? await ProjectMemoryService.get(projectId) : null;
    if (!memory && projectId) {
      memory = await ProjectMemoryService.buildFromFiles(projectId, files);
    }

    // ------------------------------------------------------------------
    // LAYER 2 — IntentClassifier: classify the user prompt
    // ------------------------------------------------------------------
    const intent = memory
      ? await IntentClassifier.classify(input, memory, chatHistory)
      : {
          type: 'modify_existing' as const,
          affected_files: [],
          needs_new_files: false,
          risk: 'medium' as const,
          reasoning: 'No memory available; defaulting to modify_existing.',
        };

    // ------------------------------------------------------------------
    // Question intent — answer in chat, no file changes
    // ------------------------------------------------------------------
    if (intent.type === 'question') {
      return await this.answerQuestion(
        input,
        files,
        memory,
        chatHistory,
        projectId,
        creditUserId,
        isFreePrompt,
        startTime,
        intent
      );
    }

    // ------------------------------------------------------------------
    // Fast lane: style/low-risk with a selected element — skip layers 3-5
    // ------------------------------------------------------------------
    if (
      selectedElement &&
      (intent.type === 'style_change' || intent.risk === 'low') &&
      !(intent.requiredPatternIds && intent.requiredPatternIds.length > 0)
    ) {
      const result = await this.runFastLane(input, files, selectedElement);
      if (result.outcome === 'success' && creditUserId) {
        if (isFreePrompt) {
          await CreditService.markFreePromptUsed(creditUserId);
        } else {
          await CreditService.deductCredits(creditUserId, 0, 0, projectId);
        }
        window.dispatchEvent(new CustomEvent('forge:credits-updated'));
      }
      if (projectId) {
        await this.logIntent({
          projectId,
          prompt: input,
          intentType: intent.type,
          intentRisk: intent.risk,
          modifiedFiles: result.modifiedFiles,
          affectedFiles: intent.affected_files,
          outcome: result.outcome || 'success',
          durationMs: Date.now() - startTime,
          requiredPatternIds: intent.requiredPatternIds,
          domain: intent.domain,
        });
      }
      return result;
    }

    // ------------------------------------------------------------------
    // Fast path: simple/low-risk edits skip Architect + Implementer + Verifier
    // ------------------------------------------------------------------
    const isSimpleEdit =
      (intent.type === 'style_change' ||
      (intent.risk === 'low' && intent.affected_files.length <= 1)) &&
      (intent.requiredPatternIds ?? []).length === 0;

    if (isSimpleEdit && files.size > 0) {
      const result = await this.runSimpleLane(input, files, selectedElement, intent, projectId);
      if (result.outcome === 'success' && creditUserId) {
        if (isFreePrompt) {
          await CreditService.markFreePromptUsed(creditUserId);
        } else {
          await CreditService.deductCredits(
            creditUserId,
            result.tokensInput ?? 0,
            result.tokensOutput ?? 0,
            projectId
          );
        }
        window.dispatchEvent(new CustomEvent('forge:credits-updated'));
      }
      if (projectId) {
        await this.logIntent({
          projectId,
          prompt: result.clarifyAsked ? `${input} [CLARIFY_ASKED]` : input,
          intentType: intent.type,
          intentRisk: intent.risk,
          modifiedFiles: result.modifiedFiles,
          affectedFiles: intent.affected_files,
          outcome: result.outcome || 'success',
          durationMs: Date.now() - startTime,
          requiredPatternIds: intent.requiredPatternIds,
          domain: intent.domain,
        });
      }
      return result;
    }

    // ------------------------------------------------------------------
    // LAYER 3 — Architect: produce a step-by-step plan
    // ------------------------------------------------------------------
    const memoryFormatted = memory
      ? ProjectMemoryService.formatForPrompt(memory)
      : '';

    // ------------------------------------------------------------------
    // Context Retrieval — fetch design patterns and design context
    // ------------------------------------------------------------------
    let patternContext = '';
    try {
      const patternQuery = [
        intent.type,
        intent.domain ?? '',
        intent.requiredPatternIds?.join(' ') ?? '',
        input.slice(0, 120),
      ].filter(Boolean).join(' ').trim();

      patternContext = await PatternRetriever.retrieve(patternQuery);
      console.log('[AIOrchestrator] PatternRetriever result chars:', patternContext?.length ?? 0); // TODO: remove after RAG verification
      if (!patternContext || patternContext.length === 0) {
        console.warn('[AIOrchestrator] PatternRetriever returned empty — check /api/embed-and-search endpoint and Gemini API key');
      }
    } catch (err) {
      console.error('[AIOrchestrator] PatternRetriever threw:', err);
    }

    const designContext = await DesignContextService.getContext(input);

    const blueprint = generateBlueprintFromFiles(files);
    const { steps, wasTrimmed, originalCount } = await Architect.plan(
      input,
      memoryFormatted,
      intent,
      designContext,
      blueprint
    );

    if (steps.length === 0) {
      // Architect returned nothing — fall back to the legacy heavy lane
      const result = await this.runHeavyLane(input, files, selectedElement, projectId);
      if (result.outcome === 'success' && creditUserId) {
        if (isFreePrompt) {
          await CreditService.markFreePromptUsed(creditUserId);
        } else {
          await CreditService.deductCredits(
            creditUserId,
            result.tokensInput ?? 0,
            result.tokensOutput ?? 0,
            projectId
          );
        }
        window.dispatchEvent(new CustomEvent('forge:credits-updated'));
      }
      if (projectId) {
        await this.logIntent({
          projectId,
          prompt: input,
          intentType: intent.type,
          intentRisk: intent.risk,
          modifiedFiles: result.modifiedFiles,
          affectedFiles: intent.affected_files,
          outcome: result.outcome || 'success',
          durationMs: Date.now() - startTime,
          requiredPatternIds: intent.requiredPatternIds,
          domain: intent.domain,
        });
      }
      return result;
    }

    // ------------------------------------------------------------------
    // LAYER 4 — Implementer: execute each step
    // ------------------------------------------------------------------
    const modifiedFilesMap = await Implementer.execute(
      steps,
      files,
      memory!,
      onProgress,
      patternContext,
      designContext
    );

    // Sanitize CSS imports — enforce that only src/index.css is used as the global CSS entry
    for (const [path, content] of modifiedFilesMap) {
      if (path.endsWith('.tsx') || path.endsWith('.ts')) {
        const sanitized = content.replace(
          /import\s+['"][^'"]*(?:globals|global)\.css['"]/g,
          `import './index.css'`
        );
        if (sanitized !== content) {
          console.warn(`[AIOrchestrator] Rewrote globals.css import in ${path} → index.css`);
          modifiedFilesMap.set(path, sanitized);
        }
      }
    }

    // Collect only the files that actually changed
    const changedPaths: string[] = [];
    for (const [path, content] of modifiedFilesMap) {
      if (!files.has(path) || files.get(path) !== content) {
        changedPaths.push(path);
      }
    }

    // ------------------------------------------------------------------
    // LAYER 5 — Verifier: compile-check and auto-fix
    // ------------------------------------------------------------------
    const verifyResult = await Verifier.verify(modifiedFilesMap, files, onRetry);

    const finalFiles = verifyResult.files;
    const finalPaths = changedPaths.filter(p => finalFiles.has(p));

    if (verifyResult.success) {
      // Notify StudioEngine about each modified file
      for (const path of finalPaths) {
        const content = finalFiles.get(path)!;
        this.notifyFileUpdate(path, content);
      }

      // Deduct credits for main pipeline
      if (creditUserId) {
        if (isFreePrompt) {
          await CreditService.markFreePromptUsed(creditUserId);
        } else {
          const totalInput = verifyResult.tokensInput ?? 0;
          const totalOutput = verifyResult.tokensOutput ?? 0;
          await CreditService.deductCredits(creditUserId, totalInput, totalOutput, projectId);
        }
        window.dispatchEvent(new CustomEvent('forge:credits-updated'));
      }

      // Update memory and record success
      if (projectId) {
        trackAICall(projectId);
        await ProjectMemoryService.updateAfterChange(projectId, finalPaths, finalFiles);
        await ProjectMemoryService.recordAction(projectId, {
          action: input.slice(0, 120),
          outcome: 'success',
        });
        await this.logIntent({
          projectId,
          prompt: input,
          intentType: intent.type,
          intentRisk: intent.risk,
          planSteps: steps,
          modifiedFiles: finalPaths,
          affectedFiles: intent.affected_files,
          outcome: 'success',
          durationMs: Date.now() - startTime,
          requiredPatternIds: intent.requiredPatternIds,
          domain: intent.domain,
        });
      }

      this.lastModifiedFiles = finalPaths;
      return {
        modifiedFiles: finalPaths,
        steps,
        outcome: 'success',
        warning: wasTrimmed
          ? `This request needed ${originalCount} steps. Only the first 6 were built. Send a follow-up to continue.`
          : undefined,
      };
    } else {
      // Verification failed after all retries — record failure and return error
      if (projectId) {
        await ProjectMemoryService.recordAction(projectId, {
          action: input.slice(0, 120),
          outcome: 'failed',
        });
        await this.logIntent({
          projectId,
          prompt: input,
          intentType: intent.type,
          intentRisk: intent.risk,
          planSteps: steps,
          modifiedFiles: [],
          affectedFiles: intent.affected_files,
          outcome: 'failed',
          errorMessage: verifyResult.error,
          durationMs: Date.now() - startTime,
          requiredPatternIds: intent.requiredPatternIds,
          domain: intent.domain,
        });
      }

      return {
        modifiedFiles: [],
        steps,
        outcome: 'failed',
        error: verifyResult.error,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Fast lane — direct /api/ai-action call for style/text tweaks
  // -------------------------------------------------------------------------

  private static async runFastLane(
    input: string,
    files: Map<string, string>,
    selectedElement: { tagName: string; className?: string }
  ): Promise<OrchestratorResult> {
    const filePath = 'src/App.tsx';
    const fileContent = files.get(filePath);
    if (!fileContent) return { modifiedFiles: [] };

    try {
      const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
      const response = await fetch('/api/ai-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization },
        body: JSON.stringify({
          userPrompt: input,
          selectedElementContext: `<${selectedElement.tagName} className='${selectedElement.className || ''}' />`,
        }),
      });

      const data = await response.json();

      let newContent = fileContent;
      if (data.action === 'update-style') {
        newContent = updateCode(fileContent, selectedElement, { className: data.className });
      } else if (data.action === 'update-text') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        newContent = updateCode(fileContent, selectedElement, { textContent: data.text } as any);
      }

      this.notifyFileUpdate(filePath, newContent);
      this.lastModifiedFiles = [filePath];
      return { modifiedFiles: [filePath], outcome: 'success' };
    } catch (e) {
      console.error('[AIOrchestrator] Fast lane error:', e);
      return { modifiedFiles: [] };
    }
  }

  // -------------------------------------------------------------------------
  // Simple lane — single Claude call for low-risk / style edits
  // -------------------------------------------------------------------------

  private static async runSimpleLane(
    input: string,
    files: Map<string, string>,
    selectedElement: { tagName: string; className?: string } | null,
    intent: Intent,
    projectId?: string
  ): Promise<OrchestratorResult> {
    const target = await this.resolveTarget(input, files, selectedElement, intent);
    if (!target) return { modifiedFiles: [] };

    // Targeting pidió aclaración (ambigüedad genuina): no editamos nada, no
    // llamamos al Verifier. Devolvemos la pregunta como respuesta de chat; la
    // respuesta del usuario re-correrá el pipeline como un mensaje nuevo.
    if ('clarify' in target) {
      console.log('[SimpleLane] clarify requested:', target.clarify);
      return {
        modifiedFiles: [],
        outcome: 'success',
        chatResponse: target.clarify,
        clarifyAsked: true,
      };
    }

    console.log('[SimpleLane] target:', target.path, '| method:', target.method);

    try {
      const response = await platformService.callForgeChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system:
          'You are a React/Tailwind expert. The user wants a simple change. ' +
          'Return ONLY the complete updated file content. No explanation, ' +
          'no markdown fences. Just the raw file starting from line 1. ' +
          'Preserve all data-oid attributes exactly as they are. ' +
          'Never write the file path as the first line of the file content. File ' +
          'content must start directly with code (imports, comments, or declarations).\n\n' +
          AVAILABLE_RUNTIME_CONTEXT,
        messages: [
          {
            role: 'user',
            content: `FILE: ${target.path}\n\nCONTENT:\n${target.content}\n\nCHANGE REQUESTED: ${input}`,
          },
        ],
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      const rawText: string = data.content?.[0]?.text ?? '';
      if (!rawText) return { modifiedFiles: [] };
      let newContent = this.stripCodeFences(rawText);
      newContent = AIOrchestrator.sanitizeFileContent(newContent);
      if (!newContent) return { modifiedFiles: [] };

      if (!this.looksLikeCode(newContent)) {
        console.warn('[AIOrchestrator] Simple lane: model returned non-code output, aborting write');
        return {
          modifiedFiles: [],
          outcome: 'failed',
          error: `Model returned prose instead of code: ${rawText.slice(0, 300)}`,
        };
      }

      // ----------------------------------------------------------------
      // PIEZA 2 — Verifier post-edición: compilar el cambio antes de escribir.
      // ----------------------------------------------------------------
      const verifyResult = await Verifier.verify(
        new Map([[target.path, newContent]]),
        files
      );

      if (verifyResult.success) {
        // Diff real: cualquier path cuyo contenido difiera del original. El
        // Verifier pudo reparar un archivo DISTINTO al editado (un huérfano roto
        // preexistente), así que no asumimos que sólo cambió target.path.
        const diffPaths: string[] = [];
        for (const [path, content] of verifyResult.files) {
          if (!files.has(path) || files.get(path) !== content) {
            if (!diffPaths.includes(path)) diffPaths.push(path);
          }
        }
        if (!diffPaths.includes(target.path)) diffPaths.push(target.path);

        for (const path of diffPaths) {
          const content = verifyResult.files.get(path);
          if (content != null) this.notifyFileUpdate(path, content);
        }

        if (projectId) {
          trackAICall(projectId);
        }
        this.lastModifiedFiles = diffPaths;

        const otherPaths = diffPaths.filter(p => p !== target.path);
        return {
          modifiedFiles: diffPaths,
          outcome: 'success',
          tokensInput: data.usage?.input_tokens ?? 0,
          tokensOutput: data.usage?.output_tokens ?? 0,
          warning: otherPaths.length > 0
            ? `Reparé además un error preexistente en: ${otherPaths.join(', ')}`
            : undefined,
        };
      }

      // Fallo tras los 3 intentos internos del Verifier: no se escribe nada.
      const errorMsg = verifyResult.error ?? 'Unknown compilation error';
      const errorFile = verifyResult.errorFile ?? null;
      const honest =
        errorFile && errorFile !== target.path
          ? `No pude aplicar el cambio: existe un error de compilación previo en ${errorFile} que no logré reparar automáticamente. Error: ${errorMsg.slice(0, 200)}`
          : `No pude aplicar el cambio sin romper la compilación. Error: ${errorMsg.slice(0, 200)}`;

      return { modifiedFiles: [], outcome: 'failed', error: honest };
    } catch (e) {
      console.error('[AIOrchestrator] Simple lane error:', e);
      return { modifiedFiles: [], outcome: 'failed' };
    }
  }

  /**
   * ¿Es un archivo de código editable bajo src/? Mismo filtro de
   * extensión/directorio que usa selectRelevantFiles.
   */
  private static isSelectableSrcFile(path: string): boolean {
    if (
      path.includes('node_modules') ||
      path.includes('dist/') ||
      !path.startsWith('src/')
    ) {
      return false;
    }
    return (
      path.endsWith('.tsx') ||
      path.endsWith('.ts') ||
      path.endsWith('.jsx') ||
      path.endsWith('.js')
    );
  }

  /**
   * Targeting en cascada para el simple lane. Resuelve el archivo que PINTA el
   * elemento que el usuario quiere cambiar, en tres niveles de confianza:
   *   1) determinista por elemento seleccionado (data-oid → className únicos),
   *   2) targeting LLM entre candidatos por keywords + intent.affected_files,
   *   3) fallback histórico: selectRelevantFiles(input, files)[0].
   */
  private static async resolveTarget(
    input: string,
    files: Map<string, string>,
    selectedElement: { tagName: string; className?: string } | null,
    intent: Intent
  ): Promise<
    | { path: string; content: string; method: 'data-oid' | 'className' | 'llm' | 'keywords' }
    | { clarify: string }
    | null
  > {
    // Universo de candidatos (usado por niveles 2/3, logueado para telemetría).
    // Orden de prioridad: (a) imports de las páginas ruteadas — los que pintan
    // píxeles; (b) intent.affected_files válidos — predicción del classifier;
    // (c) selectRelevantFiles(...).slice(0, 5) — keywords, ahora al final.
    // Deduplicado por path preservando el orden a→b→c. Cap total: 8.
    type CandidateSource = 'page-imports' | 'classifier' | 'keywords';
    const pageImportCandidates = getPageImportFiles(files);
    const affectedCandidates = (intent.affected_files ?? []).filter(
      p => files.has(p) && this.isSelectableSrcFile(p)
    );
    const keywordCandidates = selectRelevantFiles(input, files)
      .slice(0, 5)
      .map(f => f.path);

    const pool: { path: string; source: CandidateSource }[] = [];
    const seenCandidates = new Set<string>();
    const addCandidates = (paths: string[], source: CandidateSource) => {
      for (const p of paths) {
        if (seenCandidates.has(p)) continue;
        seenCandidates.add(p);
        pool.push({ path: p, source });
      }
    };
    addCandidates(pageImportCandidates, 'page-imports');
    addCandidates(affectedCandidates, 'classifier');
    addCandidates(keywordCandidates, 'keywords');

    const cappedPool = pool.slice(0, 8);
    const cappedCandidates = cappedPool.map(p => p.path);
    console.log('[SimpleLane] targeting candidates:',
      JSON.stringify(cappedPool.map(p => ({ path: p.path, source: p.source }))));

    // ----------------------------------------------------------------
    // NIVEL 1 — determinista por elemento seleccionado
    // ----------------------------------------------------------------
    if (selectedElement) {
      // El tipo real (TargetElement) declara dataOid; accedemos también a la
      // forma 'data-oid' por si el objeto río arriba la trae con guión.
      const dataOid: unknown =
        (selectedElement as Record<string, unknown>)['dataOid'] ??
        (selectedElement as Record<string, unknown>)['data-oid'];

      if (typeof dataOid === 'string' && dataOid.length > 0) {
        const matches: string[] = [];
        for (const [path, content] of files) {
          if (!path.startsWith('src/') || !path.endsWith('.tsx')) continue;
          if (path.includes('node_modules') || path.includes('dist/')) continue;
          if (content.includes(dataOid)) matches.push(path);
        }
        if (matches.length === 1) {
          return { path: matches[0], content: files.get(matches[0])!, method: 'data-oid' };
        }
      } else if (selectedElement.className && selectedElement.className.trim().length > 0) {
        const cn = selectedElement.className;
        const matches: string[] = [];
        for (const [path, content] of files) {
          if (!this.isSelectableSrcFile(path)) continue;
          if (content.includes(cn)) matches.push(path);
        }
        // Exactamente 1 → determinista. 0 o >1 → la ambigüedad NO se adivina;
        // seguimos al nivel 2.
        if (matches.length === 1) {
          return { path: matches[0], content: files.get(matches[0])!, method: 'className' };
        }
      }
    }

    // ----------------------------------------------------------------
    // NIVEL 2 — targeting LLM
    // ----------------------------------------------------------------
    if (cappedCandidates.length === 1) {
      const path = cappedCandidates[0];
      return { path, content: files.get(path)!, method: 'keywords' };
    }

    if (cappedCandidates.length >= 2) {
      // La llamada de targeting NUNCA debe romper el lane: try/catch → nivel 3.
      try {
        let userMessage = `USER REQUEST: ${input}`;
        for (const path of cappedCandidates) {
          const content = files.get(path) ?? '';
          userMessage += `\n\n--- ${path} ---\n${content.slice(0, 1500)}`;
        }

        const response = await platformService.callForgeChat({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system:
            'You choose which source file paints a visual element. Given a user ' +
            'request and several candidate files, pick the ONE file that renders ' +
            'the visual element the user wants to change — the leaf component that ' +
            'contains the relevant JSX, not the page that composes it. ' +
            'CRITICAL VISIBILITY RULE: a page-level wrapper (files in src/pages/) often has a ' +
            'background class that is NOT the visible background — child sections covering the ' +
            'viewport paint their own backgrounds on top of it. When the user refers to a visible ' +
            'surface (background, color, image of "the page" or an unnamed section), prefer the ' +
            'SECTION component whose JSX actually paints that visible surface. Only choose a ' +
            'page file when the user explicitly refers to the whole page/layout or when no ' +
            'section paints its own background. ' +
            'AMBIGUITY ESCAPE: if two or more candidates are genuinely defensible AND would ' +
            'produce visibly different results (e.g. "change the background" in a page with ' +
            'several sections that each paint their own), do NOT guess. Respond instead with ' +
            '{"reasoning": ..., "clarify": "<ONE short question in the user\'s language, naming ' +
            'the concrete options, e.g. ¿El fondo de qué sección: el hero, los productos, o el ' +
            'contacto?>"}. Use this ONLY for genuine ambiguity — if a reasonable person looking ' +
            'at the page would know what to change, decide. Asking when you could know is a ' +
            'failure. ' +
            'Respond with ONLY a JSON object. To choose a file: ' +
            '{"reasoning": "<1-2 sentences>", "path": "<one of the given paths>"}. ' +
            'To ask for clarification: {"reasoning": "<1-2 sentences>", "clarify": "<question>"}. ' +
            'The reasoning field comes FIRST — reason before you decide. ' +
            'No markdown, no code fences, no prose outside the JSON.',
          messages: [{ role: 'user', content: userMessage }],
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

        const text: string = data.content?.[0]?.text ?? '';
        const parsed = JSON.parse(this.extractJson(text)) as {
          reasoning?: unknown;
          path?: unknown;
          clarify?: unknown;
        };
        console.log('[SimpleLane] targeting reasoning:', parsed.reasoning ?? '(none)');

        const chosen = parsed?.path;
        if (typeof chosen === 'string' && files.has(chosen)) {
          return { path: chosen, content: files.get(chosen)!, method: 'llm' };
        }

        // Sin path válido pero con pregunta: escape por ambigüedad genuina.
        const clarify = parsed?.clarify;
        if (typeof clarify === 'string' && clarify.trim().length > 0) {
          return { clarify: clarify.trim() };
        }
      } catch (e) {
        console.warn('[SimpleLane] LLM targeting failed, falling back to keywords:', e);
      }
    }

    // ----------------------------------------------------------------
    // NIVEL 3 — fallback: comportamiento histórico exacto.
    // ----------------------------------------------------------------
    const fallback = selectRelevantFiles(input, files)[0];
    if (!fallback) return null;
    return { path: fallback.path, content: files.get(fallback.path)!, method: 'keywords' };
  }

  // -------------------------------------------------------------------------
  // Question lane — answer the user's question in chat, never touch files
  // -------------------------------------------------------------------------

  private static async answerQuestion(
    input: string,
    files: Map<string, string>,
    memory: ProjectMemory | null,
    chatHistory: Array<{ role: string; content: string }> | undefined,
    projectId: string | undefined,
    creditUserId: string | null,
    isFreePrompt: boolean,
    startTime: number,
    intent: Intent
  ): Promise<OrchestratorResult> {
    const blueprint = generateBlueprintFromFiles(files);
    const memorySummary = memory
      ? ProjectMemoryService.formatForPrompt(memory)
      : '';

    const relevantFiles = selectRelevantFiles(input, files);
    const fileContext = relevantFiles
      .slice(0, 2)
      .map(f => {
        const fullContent = files.get(f.path) ?? f.content;
        return `--- FILE: ${f.path} ---\n${fullContent.slice(0, 6000)}`;
      })
      .join('\n\n');

    const systemPrompt =
      "You are Wyrd Forge's AI assistant inside a web-builder IDE. The user is " +
      'asking a question about their project — answer it helpfully, in the same ' +
      'language the user wrote in. You have the project structure and the most ' +
      'relevant file contents below for context.\n\n' +
      AVAILABLE_RUNTIME_CONTEXT + '\n\n' +
      'FORMAT RULES:\n' +
      '- Markdown is supported: use **bold** and inline `code` freely; short code\n' +
      '  snippets in fences are OK when they help. Avoid headings and emojis.\n' +
      '- Be brief: maximum ~120 words of prose. This is a chat, not documentation.\n' +
      '- You can see the project files provided — never ask the user to share code.\n' +
      '- Packages resolve automatically in the preview; NEVER tell the user to run\n' +
      '  npm install or any terminal command.\n' +
      '- Never end with a question offering to implement something; the\n' +
      '  SUGGESTED_ACTION line is the only call to action.\n\n' +
      'After your answer, if the question implies something that could be built or ' +
      'changed, end with one final line in this exact format:\n' +
      'SUGGESTED_ACTION: <a short imperative prompt in the user\'s language that ' +
      'would implement it>\n' +
      'If nothing actionable applies, omit that line entirely.';

    const contextBlock =
      `PROJECT STRUCTURE:\n${blueprint}\n\n` +
      (memorySummary ? `PROJECT MEMORY:\n${memorySummary}\n\n` : '') +
      (fileContext ? `RELEVANT FILES:\n${fileContext}\n\n` : '') +
      `USER QUESTION:\n${input}`;

    const priorMessages = (chatHistory ?? []).map(msg => ({
      role: msg.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: msg.content,
    }));

    try {
      const response = await platformService.callForgeChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          ...priorMessages,
          { role: 'user' as const, content: contextBlock },
        ],
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      const rawText: string = (data.content?.[0]?.text ?? '').trim();

      // Parse out a trailing SUGGESTED_ACTION line, if present.
      let answer = rawText;
      let suggestedAction: string | undefined;
      const lines = rawText.split('\n');
      let lastNonEmpty = lines.length - 1;
      while (lastNonEmpty >= 0 && lines[lastNonEmpty].trim() === '') lastNonEmpty--;
      if (lastNonEmpty >= 0 && lines[lastNonEmpty].trim().startsWith('SUGGESTED_ACTION:')) {
        suggestedAction = lines[lastNonEmpty]
          .trim()
          .slice('SUGGESTED_ACTION:'.length)
          .trim();
        answer = lines.slice(0, lastNonEmpty).join('\n').trim();
      }

      // Deduct credits (same accounting as runSimpleLane).
      if (creditUserId) {
        if (isFreePrompt) {
          await CreditService.markFreePromptUsed(creditUserId);
        } else {
          await CreditService.deductCredits(
            creditUserId,
            data.usage?.input_tokens ?? 0,
            data.usage?.output_tokens ?? 0,
            projectId
          );
        }
        window.dispatchEvent(new CustomEvent('forge:credits-updated'));
      }

      if (projectId) {
        await this.logIntent({
          projectId,
          prompt: input,
          intentType: 'question',
          intentRisk: intent.risk,
          modifiedFiles: [],
          affectedFiles: intent.affected_files,
          outcome: 'success',
          durationMs: Date.now() - startTime,
          requiredPatternIds: intent.requiredPatternIds,
          domain: intent.domain,
        });
      }

      return {
        modifiedFiles: [],
        outcome: 'success',
        chatResponse: answer,
        suggestedAction,
      };
    } catch (e) {
      console.error('[AIOrchestrator] Question lane error:', e);
      return { modifiedFiles: [], outcome: 'failed' };
    }
  }

  // -------------------------------------------------------------------------
  // Heavy lane — legacy single-call path (fallback when Architect returns nothing)
  // -------------------------------------------------------------------------

  private static async runHeavyLane(
    input: string,
    files: Map<string, string>,
    selectedElement: { tagName: string; className?: string } | null,
    projectId?: string
  ): Promise<OrchestratorResult> {
    const relevantFiles = selectRelevantFiles(input, files);
    const blueprint = generateBlueprintFromFiles(files);

    let relevantContext = '';
    for (const f of relevantFiles) {
      relevantContext += `--- START ${f.path} ---\n${f.content}\n--- END ${f.path} ---\n`;
    }

    let projectDbContext = '';
    if (projectId) {
      try {
        const creds = await projectDBService.getCredentials(projectId);
        if (creds.projectUrl && creds.anonKey) {
          projectDbContext =
            `\n\nPROJECT DATABASE: This project has its own Supabase instance.\n` +
            `SUPABASE_URL: ${creds.projectUrl}\n` +
            `SUPABASE_ANON_KEY: ${creds.anonKey}\n` +
            `Use these values when generating Supabase client code for this project.\n`;
        }
      } catch {
        // non-critical
      }
    }

    let emailContext = '';
    if (projectId) {
      emailContext =
        `\n\nEMAIL: To send email in this project, call POST /api/email/${projectId}/send ` +
        `with { to, templateName, variables }. Do not use any third-party email SDK directly.\n`;
    }

    const systemPrompt =
      NEBU_SCHEMA_CONTEXT + projectDbContext + emailContext + '\n\n' +
      'You are an expert Senior React Engineer.\n' +
      FORMAT_INSTRUCTION + '\n' +
      REACT_TAILWIND_RULES + '\n' +
      BACKEND_RULES;

    let userMessage = '';

    // External documentation fetching
    const readUrlRegex = /Read \[(.*?)\]/g;
    let match: RegExpExecArray | null;
    const urlsToFetch: string[] = [];
    while ((match = readUrlRegex.exec(input)) !== null) {
      urlsToFetch.push(match[1]);
    }

    if (urlsToFetch.length > 0) {
      userMessage += 'EXTERNAL DOCUMENTATION:\n';
      for (const url of urlsToFetch) {
        try {
          const content = await contextService.fetchDocumentation(url);
          userMessage += `--- START CONTENT FROM ${url} ---\n${content}\n--- END CONTENT FROM ${url} ---\n\n`;
        } catch {
          userMessage += `Failed to fetch ${url}.\n`;
        }
      }
    }

    if (selectedElement) {
      userMessage += `CONTEXT: The user has selected this HTML element: <${selectedElement.tagName} className='${selectedElement.className || ''}' />. If their request is ambiguous, apply it to this element.\n\n`;
    }

    userMessage +=
      `PROJECT BLUEPRINT (File Structure):\n${blueprint}\n\n` +
      `RELEVANT FILE CONTEXT:\n${relevantContext}\n\n` +
      `USER REQUEST:\n${input}`;

    try {
      const rawResponse = await this.callLLMWithUsage(userMessage, systemPrompt);
      const cleanJson = this.cleanJsonOutput(rawResponse.text);
      const response: LLMResponse = JSON.parse(cleanJson);

      const modifiedPaths: string[] = [];
      for (const file of response.modifiedFiles) {
        this.notifyFileUpdate(file.path, this.stripCodeFences(file.newContent));
        modifiedPaths.push(file.path);

        if (file.path.startsWith('supabase/functions/') && file.path.endsWith('index.ts')) {
          const parts = file.path.split('/');
          if (parts.length === 4) {
            SupabaseService.getInstance().deployEdgeFunction(parts[2], file.newContent);
          }
        }
      }

      this.lastModifiedFiles = modifiedPaths;

      if (projectId && modifiedPaths.length > 0) {
        trackAICall(projectId);
      }

      return {
        modifiedFiles: modifiedPaths,
        outcome: 'success',
        tokensInput: rawResponse.tokensInput,
        tokensOutput: rawResponse.tokensOutput,
      };
    } catch (error) {
      console.error('[AIOrchestrator] Heavy lane error:', error);
      return { modifiedFiles: [] };
    }
  }

  // -------------------------------------------------------------------------
  // Self-correction (called externally when compilation fails)
  // -------------------------------------------------------------------------

  static async handleBuildError(error: string, _files: Map<string, string>): Promise<void> {
    if (this.retryCount >= this.maxRetries) {
      console.warn('[Self-Correction] Max retries reached. Stopping.');
      return;
    }

    this.retryCount++;
    console.log(`[Self-Correction] Attempt ${this.retryCount}/${this.maxRetries}`);

    const systemPrompt =
      'You are an expert React Engineer. You recently modified files and the build failed. ' +
      FORMAT_INSTRUCTION + '\n' +
      'Error Trace:\n' + error + '\n\n' +
      'Recently Modified Files:\n' + this.lastModifiedFiles.join(', ');

    const userMessage = 'Fix the build error.';

    try {
      const rawResponse = await this.callLLM(userMessage, systemPrompt);
      const cleanJson = this.cleanJsonOutput(rawResponse);
      const response: LLMResponse = JSON.parse(cleanJson);

      const modifiedPaths: string[] = [];
      for (const file of response.modifiedFiles) {
        this.notifyFileUpdate(file.path, this.stripCodeFences(file.newContent));
        modifiedPaths.push(file.path);
      }

      this.lastModifiedFiles = modifiedPaths;
      console.log('[Self-Correction] Applied fixes.');
    } catch (e) {
      console.error('[Self-Correction] Failed:', e);
    }
  }

  // -------------------------------------------------------------------------
  // LLM gateway — uses PlatformService to attach auth header
  // -------------------------------------------------------------------------

  static async callLLM(
    userMessage: string,
    systemPrompt: string,
    priorMessages: { role: 'user' | 'assistant'; content: string }[] = []
  ): Promise<string> {
    const result = await this.callLLMWithUsage(userMessage, systemPrompt, priorMessages);
    return result.text;
  }

  static async callLLMWithUsage(
    userMessage: string,
    systemPrompt: string,
    priorMessages: { role: 'user' | 'assistant'; content: string }[] = []
  ): Promise<{ text: string; tokensInput: number; tokensOutput: number }> {
    try {
      const response = await platformService.callForgeChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          ...priorMessages,
          { role: 'user' as const, content: userMessage },
        ],
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      if (!data.content || !data.content[0] || !data.content[0].text) {
        console.error('[AIOrchestrator] Unexpected response format:', data);
        return { text: JSON.stringify({ modifiedFiles: [] }), tokensInput: 0, tokensOutput: 0 };
      }

      return {
        text: data.content[0].text,
        tokensInput: data.usage?.input_tokens ?? 0,
        tokensOutput: data.usage?.output_tokens ?? 0,
      };
    } catch (error) {
      console.error('[AIOrchestrator] Error calling LLM:', error);
      return { text: JSON.stringify({ modifiedFiles: [] }), tokensInput: 0, tokensOutput: 0 };
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private static looksLikeCode(text: string): boolean {
    const firstLine = text.split('\n').find(l => l.trim().length > 0)?.trim() ?? '';
    const validStart = /^(import\s|export\s|const\s|function\s|type\s|interface\s|\/\/|\/\*|['"]use )/;
    if (!validStart.test(firstLine)) return false;
    if (!/\bexport\b/.test(text)) return false;
    return true;
  }

  private static stripCodeFences(text: string): string {
    const fenced = text.match(/```(?:tsx?|jsx?|typescript|javascript|css|html)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    return text.trim();
  }

  static sanitizeFileContent(content: string): string {
    return sanitizeFileContent(content);
  }

  /**
   * Extrae un objeto JSON de la respuesta del modelo, con el mismo patrón
   * defensivo que IntentClassifier: fence → llaves más externas → '{}'.
   */
  private static extractJson(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) return text.slice(start, end + 1);

    return '{}';
  }

  private static cleanJsonOutput(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return text.slice(start, end + 1);
    }

    return text.trim();
  }
}
