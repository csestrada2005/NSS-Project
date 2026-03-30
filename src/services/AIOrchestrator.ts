import { updateCode } from '../utils/ast';
import { contextService } from './ContextService';
import { SupabaseService } from './SupabaseService';
import { platformService } from './PlatformService';
import { projectDBService } from './ProjectDBService';
import { NEBU_SCHEMA_CONTEXT } from '../utils/schemaContext';
import { ProjectMemoryService } from './ProjectMemoryService';
import { PatternRetriever } from './PatternRetriever';
import { IntentClassifier } from './IntentClassifier';
import { Architect, type BuildStep } from './Architect';
import { Implementer, type ProgressCallback } from './Implementer';
import { Verifier, type RetryCallback } from './Verifier';
import { CreditService } from './CreditService';
import { PatternInjector } from './PatternInjector';

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
  return scored.slice(0, 5).map(f => ({ path: f.path, content: f.content.slice(0, 3000) }));
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
        this.notifyFileUpdate(file.path, file.newContent);
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
        prompt: params.prompt,
        intent_type: params.intentType,
        intent_risk: params.intentRisk,
        plan_steps: params.planSteps,
        modified_files: params.modifiedFiles,
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
    onRetry?: RetryCallback
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
      ? await IntentClassifier.classify(input, memory)
      : {
          type: 'modify_existing' as const,
          affected_files: [],
          needs_new_files: false,
          risk: 'medium' as const,
          reasoning: 'No memory available; defaulting to modify_existing.',
        };

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
      const result = await this.runSimpleLane(input, files, selectedElement, projectId);
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

    const { steps, wasTrimmed, originalCount } = await Architect.plan(input, memoryFormatted, intent, PatternInjector.inject(intent.requiredPatternIds ?? []));

    // ------------------------------------------------------------------
    // Pattern retrieval — fetch relevant design patterns via RAG
    // Runs in parallel with nothing (patterns are needed before Implementer)
    // Falls back silently to '' if PatternRetriever errors or finds nothing
    // ------------------------------------------------------------------
    const patternContext = steps.length > 0
      ? await PatternRetriever.retrieve(input)
      : '';

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
      patternContext
    );

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
    _selectedElement: { tagName: string; className?: string } | null,
    projectId?: string
  ): Promise<OrchestratorResult> {
    const relevantFiles = selectRelevantFiles(input, files);
    const topFile = relevantFiles[0];
    if (!topFile) return { modifiedFiles: [] };

    try {
      const response = await platformService.callChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system:
          'You are a React/Tailwind expert. The user wants a simple change. ' +
          'Return ONLY the complete updated file content. No explanation, ' +
          'no markdown fences. Just the raw file starting from line 1. ' +
          'Preserve all data-oid attributes exactly as they are.',
        messages: [
          {
            role: 'user',
            content: `FILE: ${topFile.path}\n\nCONTENT:\n${topFile.content}\n\nCHANGE REQUESTED: ${input}`,
          },
        ],
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

      const newContent: string = data.content?.[0]?.text ?? '';
      if (!newContent) return { modifiedFiles: [] };

      this.notifyFileUpdate(topFile.path, newContent);
      if (projectId) {
        trackAICall(projectId);
      }
      this.lastModifiedFiles = [topFile.path];
      return {
        modifiedFiles: [topFile.path],
        outcome: 'success',
        tokensInput: data.usage?.input_tokens ?? 0,
        tokensOutput: data.usage?.output_tokens ?? 0,
      };
    } catch (e) {
      console.error('[AIOrchestrator] Simple lane error:', e);
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
        this.notifyFileUpdate(file.path, file.newContent);
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
        this.notifyFileUpdate(file.path, file.newContent);
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
      const response = await platformService.callChat({
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
