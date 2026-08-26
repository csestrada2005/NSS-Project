import { updateCode } from '../utils/ast';
import { sanitizeFileContent } from '../utils/sanitizeFileContent';
import { contextService } from './ContextService';
import { SupabaseService } from './SupabaseService';
import { platformService } from './PlatformService';
import { projectDBService } from './ProjectDBService';
import { ProjectMemoryService } from './ProjectMemoryService';
import { PatternRetriever } from './PatternRetriever';
import { DesignContextService } from './DesignContextService';
import { IntentClassifier, type Intent } from './IntentClassifier';
import type { ProjectMemory } from './ProjectMemoryService';
import { Architect, type BuildStep } from './Architect';
import { Implementer, type ProgressCallback } from './Implementer';
import { Verifier, type RetryCallback } from './Verifier';
import { CreditService } from './CreditService';
import { REACT_TAILWIND_RULES, buildProjectContextPrefix, buildBlueprintBlock } from './promptRules';
import { buildImportedByBlock } from '../utils/importGraph.js';
import { deletionTargetsTelemetry } from '../utils/deletionGuard.js';
import { danglingRefsTelemetry } from '../utils/danglingRefs.js';
import {
  ddlProposedTelemetry,
  misplacedMigrations,
  orphanMigrationCandidates,
  resolveMigrationTargets,
  isMigrationPath,
} from '../utils/migrationPath.js';
import {
  buildMigrationIntentParams,
  intentLogResult,
  type IntentLogResult,
} from '../utils/migrationIntent.js';
import { cachedSystem, cachedSystemBlocks } from './promptCache';
import { DesignBriefService } from './DesignBriefService';
import { isAbortError } from '../utils/abort';
import { canEnterFastLane, isSimpleEditIntent } from '../utils/laneRouting.js';
import { touchesMigrations } from '../utils/migrationGate.js';

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
  outcome?: 'success' | 'failed' | 'cancelled';
  error?: string;
  /**
   * CAMBIO 2c — when error === 'INSUFFICIENT_CREDITS', the server's reason for
   * the 402 ('FREE_PROMPT_SPENT' | 'INSUFFICIENT_BALANCE'), so the UI shows the
   * honest copy (free-build-used only when the free prompt was actually spent
   * without a purchase). Undefined for every other outcome.
   */
  errorReason?: string;
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
  /**
   * Total de intentos de compilación del Verifier (verifyResult.attempts).
   * Lo propaga el simple lane hacia arriba para que su logIntent cablee
   * compile_attempts sin re-ejecutar el Verifier. undefined si no se verificó.
   */
  compileAttempts?: number;
}

// ---------------------------------------------------------------------------
// File relevance scoring — used by the legacy heavy lane and plan steps
// ---------------------------------------------------------------------------

/** Same directory/extension gate selectRelevantFiles uses for candidates. */
function isEditableSrcPath(path: string): boolean {
  if (path.includes('node_modules') || path.includes('dist/')) return false;
  if (!path.startsWith('src/')) return false;
  return (
    path.endsWith('.tsx') ||
    path.endsWith('.ts') ||
    path.endsWith('.jsx') ||
    path.endsWith('.js')
  );
}

/**
 * Per-file cap for SECONDARY (support) context files. Target files are exempt.
 */
const SECONDARY_FILE_CAP = 3000;
/**
 * Global safety guard for the whole relevant-files block. When the assembled
 * context exceeds this, secondary files are trimmed first — target files are
 * never touched.
 */
const RELEVANT_CONTEXT_TOTAL_CAP = 50_000;

/**
 * CAMBIO 1 — tiered relevant-file context.
 *
 * Historically every file was sliced to 3000 chars, so a target file the intent
 * actually edits (e.g. a 6.7 KB HeroSection) reached the model at ~half its
 * length and the model replied "the code is incomplete" — while the system
 * prompt demands it never truncate output. Now:
 *
 *  - TARGET files (paths the intent will modify: the classifier's affected_files
 *    or a step's file_path) are always included with their COMPLETE content, no
 *    slice.
 *  - SECONDARY files (keyword-scored support context) keep the 3000-char cap.
 *  - A global guard (~50k chars) trims secondaries first — never targets — and
 *    logs once when it acts.
 *
 * `targetPaths` are matched against the project files and the editable-src gate;
 * anything invalid is ignored. With no targets the behavior matches the legacy
 * top-5 keyword selection (now with the global guard as a backstop).
 */
function selectRelevantFiles(
  userMessage: string,
  files: Map<string, string>,
  targetPaths: Iterable<string> = []
): { path: string; content: string }[] {
  const keywords = userMessage
    .split(/[\s\p{P}]+/u)
    .map(w => w.toLowerCase())
    .filter(w => w.length > 3);

  const scored: { path: string; content: string; score: number }[] = [];

  for (const [path, content] of files) {
    if (!isEditableSrcPath(path)) continue;

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

  // Target set: real, editable src files the intent will modify.
  const targetSet = new Set<string>();
  for (const p of targetPaths) {
    if (files.has(p) && isEditableSrcPath(p)) targetSet.add(p);
  }

  // Targets first (full content), then the top secondaries by score (capped),
  // excluding anything already surfaced as a target.
  const targetEntries = [...targetSet].map(p => ({
    path: p,
    content: files.get(p)!,
    isTarget: true,
  }));
  const secondaryEntries = scored
    .filter(f => !targetSet.has(f.path))
    .slice(0, 5)
    .map(f => ({
      path: f.path,
      content: f.content.slice(0, SECONDARY_FILE_CAP),
      isTarget: false,
    }));

  const entries = [...targetEntries, ...secondaryEntries];

  // Global guard: if the whole block is too large, shrink/drop secondaries from
  // the lowest-priority end inward. Target content is never trimmed.
  let total = entries.reduce((n, e) => n + e.content.length, 0);
  if (total > RELEVANT_CONTEXT_TOTAL_CAP) {
    const before = total;
    for (let i = secondaryEntries.length - 1; i >= 0 && total > RELEVANT_CONTEXT_TOTAL_CAP; i--) {
      const e = secondaryEntries[i];
      const over = total - RELEVANT_CONTEXT_TOTAL_CAP;
      if (e.content.length <= over) {
        total -= e.content.length;
        e.content = '';
      } else {
        e.content = e.content.slice(0, e.content.length - over);
        total -= over;
      }
    }
    console.warn(
      `[AIOrchestrator] context guard: relevant-file block ${before} chars > ${RELEVANT_CONTEXT_TOTAL_CAP} cap; ` +
      `trimmed secondary files to ${total} chars (target files kept in full)`
    );
  }

  return entries
    .filter(e => e.isTarget || e.content.length > 0)
    .map(e => ({ path: e.path, content: e.content }));
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

/** Parse the heading/body font families out of the project's DESIGN.md. */
function parseFontsFromDesignMd(
  md: string | undefined
): { heading: string; body: string } | null {
  if (typeof md !== 'string') return null;
  const heading = md.match(/\*\*Headings:\*\*\s*(.+)/)?.[1]?.trim();
  const body = md.match(/\*\*Body:\*\*\s*(.+)/)?.[1]?.trim();
  if (!heading || !body) return null;
  return { heading, body };
}

/**
 * Design-brief guard — deterministic backstop for the WHOLE brief block in
 * src/index.css, not just the palette.
 *
 * The scaffold wires three things into index.css: (a) the 5 --brand-* variables
 * under :root, (b) a `body` rule (brand background/foreground + the brief's body
 * font) and (c) an h1–h6 rule with the brief's heading font. When the Implementer
 * rewrites index.css it sometimes drops the palette AND this base wiring, which
 * silently breaks the app's colors and typography. This restores whichever parts
 * were dropped before the file is persisted.
 *
 * Authoritative sources: the brand vars come from the project's CURRENT
 * src/index.css (the scaffolded one); the font families come from DESIGN.md (the
 * persisted brief). If the current CSS has no brand vars — no brief was ever
 * applied — this is a no-op.
 *
 * Returns { guarded: true, restored } listing which parts it restored, so the
 * caller can log a single telemetry line.
 */
function reinjectBrandBriefIfDropped(
  newCss: string,
  originalCss: string | undefined,
  designMd: string | undefined
): { css: string; guarded: boolean; restored: string[] } {
  if (typeof originalCss !== 'string') return { css: newCss, guarded: false, restored: [] };

  // Collect the brief's brand declarations from the scaffolded index.css.
  const declRe = /(--brand-[\w-]+)\s*:\s*([^;]+);/g;
  const briefVars = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(originalCss)) !== null) {
    if (!briefVars.has(m[1])) briefVars.set(m[1], m[2].trim());
  }
  // A real brief defines exactly 5 --brand-* vars. Fewer means no brief was
  // applied — nothing authoritative to enforce.
  if (briefVars.size < 5) return { css: newCss, guarded: false, restored: [] };

  let css = newCss;
  const restored: string[] = [];

  // --- (a) Brand palette variables in :root ---------------------------------
  const missingVars = [...briefVars.keys()].filter(v => {
    const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return !new RegExp(esc + '\\s*:').test(css);
  });
  if (missingVars.length > 0) {
    const declarations = [...briefVars.entries()]
      .map(([v, hsl]) => `    ${v}: ${hsl};`)
      .join('\n');
    const block = `\n    /* Brand palette (design brief) — re-injected by brief guard */\n${declarations}\n`;
    const rootIdx = css.indexOf(':root {');
    if (rootIdx !== -1) {
      const insertAt = rootIdx + ':root {'.length;
      css = css.slice(0, insertAt) + block + css.slice(insertAt);
    } else {
      css = `:root {${block}}\n\n${css}`;
    }
    restored.push('brand palette');
  }

  // --- (b) body wiring + (c) headings font ----------------------------------
  // Font families come from DESIGN.md. Without them we cannot restore typography
  // (but the palette above is still enforced).
  const fonts = parseFontsFromDesignMd(designMd);
  if (fonts) {
    const hasBodyBg = css.includes('hsl(var(--brand-bg))');
    const hasBodyFg = css.includes('hsl(var(--brand-fg))');
    const hasBodyFont = css.includes(`'${fonts.body}'`);
    const hasHeadingFont = css.includes(`'${fonts.heading}'`);
    if (!hasBodyBg || !hasBodyFg || !hasBodyFont || !hasHeadingFont) {
      // Rebuild the whole base block (idempotent via the sentinel markers).
      css = css.replace(DesignBriefService.baseBlockRegex(), '').trimEnd();
      css = `${css}\n\n${DesignBriefService.buildBaseCss(fonts.heading, fonts.body)}\n`;
      if (!hasBodyBg || !hasBodyFg || !hasBodyFont) restored.push('body wiring');
      if (!hasHeadingFont) restored.push('headings font');
    }
  }

  return { css, guarded: restored.length > 0, restored };
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

// REACT_TAILWIND_RULES is imported from ./promptRules — the single shared
// constant used by every generation lane (plan, simple, heavy, and the
// per-step Implementer), including the anti-template / brand rules.

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
// Dependency audit (P0-2) — deterministic, no LLM
// ---------------------------------------------------------------------------

/**
 * Curated dependency versions for the export audit. The preview runtime vendors
 * or aliases these bare imports (see server/compiler.js), so a generated project
 * compiles inside Wyrd even when they are absent from its package.json. An
 * EXPORTED zip has no such runtime — every imported package must be declared for
 * `npm install && vite build` to succeed outside Wyrd. Versions are pinned to
 * ranges compatible with the template's React 18 baseline. Anything imported but
 * missing from this table is still added, as "latest", with a warning.
 *
 * Includes the packages named in AVAILABLE_RUNTIME_CONTEXT plus the template's
 * own runtime deps (react, react-dom, react-router-dom + the shadcn set).
 */
const KNOWN_DEP_VERSIONS: Record<string, string> = {
  // Explicitly runtime-vendored / encouraged. PINNED (CIRUGÍA P1-6, CAMBIO 4) in
  // lockstep with the template package.json (shadcnDefaults + shadcnComponents +
  // templates.ts) so an exported project reproduces the tree the preview ran.
  'framer-motion': '11.15.0',
  'lucide-react': '0.469.0',
  clsx: '2.1.1',
  'tailwind-merge': '2.6.0',
  'react-router-dom': '^7.18.2',
  // shadcn base — cva + the Radix primitives the 10 template components import.
  // Resolve via esm.sh in the preview; declared here so `npm install` outside
  // Wyrd installs the exact versions the template ships.
  'class-variance-authority': '0.7.1',
  'tailwindcss-animate': '1.0.7',
  '@radix-ui/react-slot': '1.1.1',
  '@radix-ui/react-accordion': '1.2.2',
  '@radix-ui/react-dialog': '1.1.4',
  '@radix-ui/react-label': '2.1.1',
  '@radix-ui/react-separator': '1.1.1',
  '@radix-ui/react-tabs': '1.1.2',
  // Common well-known packages the preview resolves via esm.sh
  'date-fns': '^4.1.0',
  recharts: '^2.12.0',
  zustand: '^4.5.0',
  sonner: '^1.5.0',
  'react-markdown': '^9.0.0',
  // Template runtime baseline
  react: '^18.3.1',
  'react-dom': '^18.3.1',
};

/** Node built-in module names never added as npm deps by the audit. */
const NODE_BUILTINS = new Set([
  'fs', 'path', 'http', 'https', 'os', 'crypto', 'stream', 'util', 'events',
  'child_process', 'url', 'querystring', 'zlib', 'net', 'tls', 'dns', 'buffer',
  'assert', 'process',
]);

/**
 * Resolve a bare import specifier to its npm package name, or null when the
 * specifier is not an npm package (relative path, `@/` alias, protocol URL,
 * Node builtin-shaped, or malformed). Scoped packages keep `@scope/name`;
 * subpaths (e.g. `framer-motion/dist`) collapse to the package root.
 */
function packageNameFromSpecifier(spec: string): string | null {
  if (!spec) return null;
  if (spec.startsWith('.') || spec.startsWith('/')) return null; // relative / absolute
  if (spec.startsWith('@/')) return null;                        // path alias
  if (spec.includes('://') || spec.startsWith('node:') || spec.startsWith('data:')) return null;
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  const name = spec.split('/')[0];
  return /^[a-z0-9~][a-z0-9-._]*$/.test(name) ? name : null;
}

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

  /**
   * Callback invoked for every file the AI DELETES. Registered by StudioEngine.
   * A deletion cannot travel through fileUpdateCallback: that bridge carries
   * (path, content) pairs, and the whole point of a delete is that there is no
   * content and the row must leave forge_files.
   */
  private static fileDeleteCallback: ((path: string) => void) | null = null;

  static setFileDeleteCallback(cb: (path: string) => void) {
    this.fileDeleteCallback = cb;
  }

  private static notifyFileDelete(path: string) {
    this.fileDeleteCallback?.(path);
  }

  // -------------------------------------------------------------------------
  // Dependency audit (P0-2) — keep package.json in sync with imports so the
  // exported zip builds outside Wyrd. Deterministic, no LLM.
  // -------------------------------------------------------------------------

  /**
   * Cross the bare imports of the just-written .ts/.tsx files against the
   * project's package.json `dependencies`. For every imported package that is
   * absent, add it with its curated KNOWN_DEP_VERSIONS version (or "latest" +
   * warning when unknown). Returns the updated package.json { path, content } to
   * persist, or null when nothing changed / no package.json exists.
   *
   * `writtenFiles` are the files persisted in this step/edit; `allFiles` is the
   * full project map (source of the current package.json when this step did not
   * rewrite it). Pure aside from console logging — one line per dep added.
   */
  private static auditDependencies(
    writtenFiles: Map<string, string>,
    allFiles: Map<string, string>
  ): { path: string; content: string; added: string[] } | null {
    const pkgRaw = writtenFiles.get('package.json') ?? allFiles.get('package.json');
    if (typeof pkgRaw !== 'string') return null;

    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
    } catch {
      console.warn('[AIOrchestrator] dep audit: package.json is not valid JSON, skipping');
      return null;
    }

    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;

    // Extract bare imports from every written .ts/.tsx. Matches both
    // `import ... from '<spec>'` / `export ... from '<spec>'` and dynamic
    // `import('<spec>')`.
    const importRe =
      /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    const needed = new Set<string>();
    for (const [path, content] of writtenFiles) {
      if (!path.endsWith('.ts') && !path.endsWith('.tsx')) continue;
      if (typeof content !== 'string') continue;
      importRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(content)) !== null) {
        const spec = m[1] ?? m[2];
        const name = packageNameFromSpecifier(spec);
        if (name) needed.add(name);
      }
    }

    const added: string[] = [];
    for (const name of needed) {
      if (name in deps || name in devDeps || NODE_BUILTINS.has(name)) continue;
      const version = KNOWN_DEP_VERSIONS[name];
      if (version) {
        deps[name] = version;
        console.log(`[AIOrchestrator] dep audit: added ${name}@${version} to package.json`);
      } else {
        deps[name] = 'latest';
        console.warn(`[AIOrchestrator] dep audit: ${name} not in KNOWN_DEP_VERSIONS — added as "latest"`);
      }
      added.push(name);
    }

    if (added.length === 0) return null;

    // Re-emit dependencies alphabetically for a stable, reviewable diff.
    const sortedDeps: Record<string, string> = {};
    for (const k of Object.keys(deps).sort()) sortedDeps[k] = deps[k];
    pkg.dependencies = sortedDeps;

    // `added` sale con el resultado porque el aviso al usuario NO es el mismo
    // que el de una reparación fuera del plan: aquí no se arregló nada roto, se
    // declaró la dependencia que el código nuevo importa. Ver el warning.
    return { path: 'package.json', content: JSON.stringify(pkg, null, 2) + '\n', added };
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

    // CAMBIO 1a — el system prompt queda 100% estático (reglas + contrato de
    // formato). La tarea concreta del step (antes `Task: ${...}` en el system)
    // vive sólo en el user message, que ya la lleva como USER REQUEST — así el
    // prefijo del system es cacheable y no cambia por step.
    const systemPrompt =
      'You are an expert Senior React Engineer. Implement the following step from the plan.\n' +
      FORMAT_INSTRUCTION + '\n' +
      REACT_TAILWIND_RULES + '\n' +
      BACKEND_RULES;

    const userMessage =
      `PROJECT BLUEPRINT (File Structure):\n${blueprint}\n\n` +
      `RELEVANT FILE CONTEXT:\n${relevantContext}\n\n` +
      `TASK (implement this step):\n${nextStepDescription}\n\n` +
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

  // CAMBIO 5 — was the previous turn a clarification question the user is now
  // answering? Authoritative signal: the project's most recent forge_intent_log
  // row carries the [CLARIFY_ASKED] marker the simple lane writes. If so, return
  // the last assistant message (the question itself) so the targeting prompt can
  // echo it and forbid re-asking. Fails open (returns null) on any error.
  private static async resolvePriorClarifyQuestion(
    projectId: string | undefined,
    chatHistory?: Array<{ role: string; content: string }>,
  ): Promise<string | null> {
    if (!projectId || !chatHistory || chatHistory.length === 0) return null;
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data } = await supabase
        .from('forge_intent_log')
        .select('user_prompt')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1);
      const lastPrompt = data?.[0]?.user_prompt as string | undefined;
      if (!lastPrompt || !lastPrompt.includes('[CLARIFY_ASKED]')) return null;
      const lastAssistant = [...chatHistory].reverse().find(m => m.role === 'assistant');
      return lastAssistant?.content?.trim() || null;
    } catch {
      return null;
    }
  }

  private static async logIntent(params: {
    projectId: string;
    prompt: string;
    intentType?: string;
    intentRisk?: string;
    planSteps?: BuildStep[];
    modifiedFiles: string[];
    affectedFiles?: string[];
    outcome: 'success' | 'failed' | 'cancelled';
    errorMessage?: string | null;
    compileAttempts?: number;
    durationMs: number;
    requiredPatternIds?: string[];
    domain?: string;
  }): Promise<IntentLogResult> {
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return intentLogResult('no_session');

      const { error } = await supabase.from('forge_intent_log').insert({
        project_id: params.projectId,
        user_id: user.id,
        user_prompt: params.prompt,
        intent_type: params.intentType,
        intent_risk: params.intentRisk,
        // Telemetría cableada: escribimos las columnas jsonb que la app lee de
        // verdad (AIHistoryPanel selecciona plan_steps / modified_files). El
        // plan del Architect va tal cual (BuildStep[]); si el lane no produjo
        // plan (simple/fast/question/heavy-fallback) plan_steps queda NULL —
        // esa ausencia ya es señal útil de qué lane corrió. modified_files
        // reutiliza los paths efectivamente persistidos (diff/ImplementerResult)
        // que cada caller ya calcula; en parciales/fallos refleja SOLO lo escrito.
        plan_steps: params.planSteps ?? null,
        modified_files: params.modifiedFiles ?? [],
        affected_files: params.affectedFiles ?? [],
        outcome: params.outcome,
        error_message: params.errorMessage ?? null,
        compile_attempts: params.compileAttempts ?? 0,
        duration_ms: params.durationMs,
        required_pattern_ids: params.requiredPatternIds ?? [],
        domain: params.domain ?? 'general',
      });
      // supabase-js NO lanza cuando PostgREST rechaza: devuelve `{ error }`. El
      // valor se DEVUELVE en vez de tragarse; los callers generales lo ignoran
      // (su comportamiento observable no cambia: se sigue sin lanzar y se sigue
      // sin cortar el flujo), y la puerta de migraciones lo propaga porque allí
      // la fila perdida acompaña a un DDL irreversible.
      return intentLogResult(error);
    } catch (e) {
      console.error('[AIOrchestrator] Failed to log intent:', e);
      return intentLogResult(e);
    }
  }

  /**
   * Única puerta pública a logIntent, para MigrationRunner.
   *
   * REGLA R4 INTACTA: logIntent sigue siendo el ÚNICO escritor de
   * forge_intent_log — este método no inserta nada, delega. La alternativa
   * (que MigrationRunner hiciera su propio `.insert()`) crearía un segundo
   * escritor y con él una segunda forma de la fila: otro criterio de qué es un
   * outcome, otro juego de columnas, otra manera de olvidarse del user_id.
   * `grep -rn "from('forge_intent_log').insert" src/` debe seguir devolviendo
   * exactamente una línea.
   *
   * La superficie es deliberadamente estrecha: la aplicación de una migración
   * no tiene plan, ni patrones, ni intentos de compilación, así que esos campos
   * ni se exponen. El intentType queda fijado a 'database_change' porque eso es
   * literalmente lo que un DDL aplicado ES — no es un parámetro que el caller
   * pueda equivocar. Por el mismo motivo el intentRisk tampoco se acepta: queda
   * fijado a 'high' en src/utils/migrationIntent.js. Es riesgo DECLARADO, no
   * clasificado — el DDL aplicado es la única operación irreversible del
   * sistema y debe aparecer en cualquier auditoría por riesgo. Cuando era
   * opcional nadie lo pasaba, la clave viajaba undefined, supabase-js la omitía
   * y la columna (NOT NULL, sin default) devolvía 400: DDL aplicado sin fila.
   *
   * DEVUELVE la señal del insert. El caller la propaga en su reason SIN tocar
   * el outcome: que el DDL se aplicara y que su registro llegara son dos
   * verdades independientes.
   */
  static async logMigrationIntent(params: {
    projectId: string;
    /** user_prompt ya con su sufijo [DDL_APPLIED:...] / [DDL_FAILED:...] / [DDL_SKIPPED:...]. */
    prompt: string;
    modifiedFiles: string[];
    outcome: 'success' | 'failed';
    errorMessage?: string | null;
    durationMs: number;
  }): Promise<IntentLogResult> {
    // El payload se construye en src/utils/migrationIntent.js —puro y con
    // tests— porque el bug no estaba en el insert sino en el OBJETO: sin
    // intentRisk, supabase-js omitía la clave, intent_risk es NOT NULL sin
    // default y la fila no entraba. Aquí ya no hay forma de omitirla.
    return this.logIntent(buildMigrationIntentParams(params));
  }

  /**
   * CAMBIO 4 — ¿el estado actual del proyecto compila? Compila el proyecto
   * completo vía /api/compile. Ante un error de servidor/red devolvemos false
   * (no afirmamos una salud que no pudimos verificar) para que el flujo normal
   * siga su curso en vez de cortocircuitar sobre información incompleta.
   */
  private static async currentStateCompiles(
    files: Map<string, string>,
    signal?: AbortSignal
  ): Promise<boolean> {
    try {
      const filesObj: Record<string, string> = {};
      for (const [path, content] of files) filesObj[path] = content;
      const result = await platformService.compileSrc(filesObj, signal);
      return !result.error;
    } catch {
      return false;
    }
  }

  /**
   * CAMBIO 4 — ¿este fix nace de un error de runtime reportado? Dos señales:
   *  1. El prompt es el del botón "Corregir con AI" (buildRuntimeErrorFixPrompt),
   *     que arranca con "Corrige este error de runtime…".
   *  2. El último turno del asistente en el chat es un aviso de runtime (⚠ …):
   *     el usuario está respondiendo a un error recién mostrado.
   * Si ninguna se cumple, un "arregla el preview" sobre un proyecto sano no
   * tiene un error activo que reparar.
   */
  private static hasReportedRuntimeError(
    input: string,
    chatHistory?: Array<{ role: string; content: string }>
  ): boolean {
    if (/^\s*Corrige este error de runtime/i.test(input)) return true;
    const lastAssistant = [...(chatHistory ?? [])].reverse().find((m) => m.role === 'assistant');
    const content = lastAssistant?.content ?? '';
    return (
      content.includes('Error de runtime en el preview') ||
      content.includes('El código falló al cargar')
    );
  }

  /**
   * Persiste (vía notifyFileUpdate) todo path de `modifiedFiles` cuyo contenido
   * difiera del original y devuelve esos paths. Usado por las ramas de
   * cancelación del plan lane: escribe SOLO lo realmente completado (steps que
   * terminaron antes del abort), nunca un archivo a medias.
   */
  private static persistCompleted(
    modifiedFiles: Map<string, string>,
    original: Map<string, string>,
    deletedPaths: string[] = []
  ): string[] {
    const written: string[] = [];
    for (const [path, content] of modifiedFiles) {
      if (!original.has(path) || original.get(path) !== content) {
        this.notifyFileUpdate(path, content);
        written.push(path);
      }
    }
    // A delete step that finished before the abort is completed work like any
    // other: it propagates to forge_files, not just to the in-memory map.
    for (const path of deletedPaths) {
      if (!original.has(path)) continue;
      this.notifyFileDelete(path);
      written.push(path);
    }
    return written;
  }

  /**
   * DEPRECATED (CIRUGÍA: cobro dentro del pipeline servido). Charging no longer
   * happens from a client call at intent close — it is applied SERVER-SIDE from
   * the tokens the server itself accumulates per intent (see PlatformService
   * intent headers + server.js chargeAccumulatedIntent/sweep). This method is
   * kept as a no-op so the existing lane call sites stay untouched; the actual
   * charge + balance refresh are driven by platformService.closeIntent() and the
   * server sweep. The `tokens*` args are intentionally ignored — the client is
   * never trusted for billing amounts.
   */
  private static async settleCredits(
    intentType: string,
    tokensInput: number,
    tokensOutput: number,
    projectId?: string
  ): Promise<void> {
    // no-op — server charges the accumulated intent. The tokens are ignored on
    // purpose: the client is never trusted for billing amounts.
    void intentType;
    void tokensInput;
    void tokensOutput;
    void projectId;
  }

  /**
   * CAMBIO 2 — cierre honesto de un run cancelado. Cobra el mínimo disponible
   * (granularidad per-intent) SOLO si algo se produjo, registra el intent con
   * outcome='cancelled' y los archivos realmente escritos, y devuelve el mensaje
   * honesto para el chat. `writtenPaths` ya fue persistido por el caller.
   */
  private static async finalizeCancelled(params: {
    input: string;
    intent: Intent;
    writtenPaths: string[];
    projectId?: string;
    creditUserId: string | null;
    startTime: number;
    planSteps?: BuildStep[];
    compileAttempts?: number;
  }): Promise<OrchestratorResult> {
    const { writtenPaths, projectId, creditUserId } = params;

    // Créditos: sólo cobramos si el run llegó a producir archivos completos. Un
    // abort sin salida útil no quema el free-prompt del usuario. El server
    // decide free-prompt vs deducción; aquí sólo enviamos 0 tokens.
    if (creditUserId && writtenPaths.length > 0) {
      await this.settleCredits(params.intent.type, 0, 0, projectId);
    }

    if (projectId) {
      if (writtenPaths.length > 0) {
        trackAICall(projectId);
        await ProjectMemoryService.recordAction(projectId, {
          action: params.input.slice(0, 120),
          outcome: 'cancelled',
        });
      }
      await this.logIntent({
        projectId,
        prompt: `${params.input} [CANCELLED]`,
        intentType: params.intent.type,
        intentRisk: params.intent.risk,
        planSteps: params.planSteps,
        modifiedFiles: writtenPaths,
        affectedFiles: params.intent.affected_files,
        outcome: 'cancelled',
        compileAttempts: params.compileAttempts,
        errorMessage: null,
        durationMs: Date.now() - params.startTime,
        requiredPatternIds: params.intent.requiredPatternIds,
        domain: params.intent.domain,
      });
    }

    this.lastModifiedFiles = writtenPaths;
    const n = writtenPaths.length;
    return {
      modifiedFiles: writtenPaths,
      outcome: 'cancelled',
      chatResponse: `Generación cancelada — se conservaron ${n} archivo${n === 1 ? '' : 's'} completado${n === 1 ? '' : 's'}.`,
    };
  }

  static async parseUserCommand(
    input: string,
    files: Map<string, string>,
    selectedElement: { tagName: string; className?: string } | null = null,
    projectId?: string,
    onProgress?: ProgressCallback,
    onRetry?: RetryCallback,
    chatHistory?: Array<{ role: string; content: string }>,
    signal?: AbortSignal
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
    let creditAllowed = true;
    let creditReason: string | undefined;
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        creditUserId = user.id;
        // Server-authoritative preflight: the pipeline must not run when the
        // user is out of credits (the server answers 402 → allowed:false).
        const creditCheck = await CreditService.canMakeCall();
        creditAllowed = creditCheck.allowed;
        creditReason = creditCheck.reason;
      }
    } catch (e) {
      console.error('[AIOrchestrator] Credit check error:', e);
      // Fail open on credit check errors
    }

    // Out of credits → stop before any LLM call. The UI renders the honest
    // "top up credits" message for this error code, choosing the wording from
    // errorReason (free-build-used vs insufficient-balance).
    if (creditUserId && !creditAllowed) {
      return {
        modifiedFiles: [],
        outcome: 'failed',
        error: 'INSUFFICIENT_CREDITS',
        errorReason: creditReason,
      };
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
      ? await IntentClassifier.classify(input, memory, chatHistory, signal)
      : {
          type: 'modify_existing' as const,
          affected_files: [],
          needs_new_files: false,
          risk: 'medium' as const,
          reasoning: 'No memory available; defaulting to modify_existing.',
        };

    // Tag the open intent with its classified type so the server records it on
    // the credit transaction (audit metadata only — billing derives userId and
    // tokens server-side, never from the client).
    platformService.setIntentType(intent.type);

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
        startTime,
        intent,
        signal
      );
    }

    // ------------------------------------------------------------------
    // CAMBIO 4 — veredicto honesto del fix sobre proyecto sano.
    //
    // Un fix_bug sobre un proyecto que compila y sin error de runtime activo no
    // tiene nada que reparar: en vez de arrancar el pipeline y cerrar como
    // failed/0-attempts, respondemos pidiendo qué comportamiento se ve mal y
    // cerramos con outcome='success'. Cuando el fix SÍ nace de un error de
    // runtime (botón "Corregir con AI" o un ⚠ reciente en el chat), NO
    // cortocircuitamos: hay algo concreto que arreglar.
    // ------------------------------------------------------------------
    if (
      intent.type === 'fix_bug' &&
      files.size > 0 &&
      !this.hasReportedRuntimeError(input, chatHistory)
    ) {
      const compiles = await this.currentStateCompiles(files, signal);
      if (signal?.aborted) {
        return await this.finalizeCancelled({
          input, intent, writtenPaths: [], projectId, creditUserId, startTime,
        });
      }
      if (compiles) {
        if (projectId) {
          await this.logIntent({
            projectId,
            prompt: input,
            intentType: intent.type,
            intentRisk: intent.risk,
            modifiedFiles: [],
            affectedFiles: intent.affected_files,
            outcome: 'success',
            compileAttempts: 1,
            durationMs: Date.now() - startTime,
            requiredPatternIds: intent.requiredPatternIds,
            domain: intent.domain,
          });
        }
        return {
          modifiedFiles: [],
          outcome: 'success',
          chatResponse:
            'El proyecto compila y no encuentro errores activos — ¿qué comportamiento ves mal?',
        };
      }
    }

    // ------------------------------------------------------------------
    // Fast lane: style/low-risk with a selected element — skip layers 3-5
    //
    // CAMBIO 4 — no more hardcoded 'src/App.tsx'. The fast lane only runs when the
    // selection resolved to a real file (selectedElement.filePath from the oidMap);
    // without one we fall through to the simple lane rather than editing App.tsx
    // blindly.
    //
    // El gate vive en utils/laneRouting.js — canEnterFastLane excluye además los
    // tipos que sólo el plan lane puede resolver (database_change: su entregable
    // es un .sql de supabase/migrations/, y esta lane sólo toca el archivo de la
    // selección, siempre bajo src/).
    // ------------------------------------------------------------------
    const fastLaneFilePath = (selectedElement as { filePath?: string } | null)?.filePath;
    if (
      // `selectedElement &&` va delante para que TS lo estreche a no-nulo de cara
      // a runFastLane; canEnterFastLane vuelve a mirarlo vía hasSelection.
      selectedElement &&
      canEnterFastLane({
        intent,
        hasSelection: Boolean(selectedElement),
        selectionFileExists:
          typeof fastLaneFilePath === 'string' && files.has(fastLaneFilePath),
      })
    ) {
      const result = await this.runFastLane(input, files, selectedElement, signal);
      if (result.outcome === 'success' && creditUserId) {
        await this.settleCredits(intent.type, 0, 0, projectId);
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
    // CAMBIO 5 — clarification follow-up context. If the previous turn ended by
    // asking the user a clarifying question (logged with the [CLARIFY_ASKED]
    // marker), this message is their answer: carry the prior question into the
    // targeting prompt with a firm "do NOT ask again" so the lane decides instead
    // of looping. The previous question is the last assistant message in the
    // display history.
    // ------------------------------------------------------------------
    const previousClarifyQuestion = await this.resolvePriorClarifyQuestion(
      projectId,
      chatHistory,
    );

    // ------------------------------------------------------------------
    // Fast path: simple/low-risk edits skip Architect + Implementer + Verifier
    // ------------------------------------------------------------------
    // El gate vive en utils/laneRouting.js — isSimpleEditIntent excluye además
    // los tipos que sólo el plan lane puede resolver. database_change es el caso:
    // el targeting de esta lane filtra candidatos con isSelectableSrcFile
    // (.ts/.tsx/.js/.jsx bajo src/), así que una migración de supabase/migrations/
    // no puede ser objetivo por construcción y el intent moriría en un clarify
    // sin salida en vez de escribir el .sql.
    const isSimpleEdit = isSimpleEditIntent(intent);

    if (isSimpleEdit && files.size > 0) {
      const result = await this.runSimpleLane(input, files, selectedElement, intent, projectId, signal, previousClarifyQuestion);
      if (result.outcome === 'success' && creditUserId) {
        await this.settleCredits(intent.type, result.tokensInput ?? 0, result.tokensOutput ?? 0, projectId);
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
          // PIEZA 4 — telemetría cableada del simple lane (ya corrió el Verifier).
          compileAttempts: result.compileAttempts,
          errorMessage: result.outcome === 'failed' ? (result.error ?? null) : null,
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
      // Vector search uses the CLEAN user prompt only (no intent.type / domain /
      // pattern IDs / prefixes). The classifier-requested pattern IDs are
      // resolved separately by the retriever via a deterministic id/name lookup.
      patternContext = await PatternRetriever.retrieve(input, intent.requiredPatternIds ?? []);
      console.log('[AIOrchestrator] PatternRetriever result chars:', patternContext?.length ?? 0); // TODO: remove after RAG verification
      if (!patternContext || patternContext.length === 0) {
        console.warn('[AIOrchestrator] PatternRetriever returned empty — check /api/embed-and-search endpoint and Gemini API key');
      }
    } catch (err) {
      console.error('[AIOrchestrator] PatternRetriever threw:', err);
    }

    // Pass `files` so the per-project DESIGN.md brief is prepended to the
    // design context and reaches both Architect.plan and the Implementer steps.
    const designContext = await DesignContextService.getContext(input, files);

    const blueprint = generateBlueprintFromFiles(files);
    // El blueprint es una lista de PATHS: dice qué archivos hay, no quién usa a
    // quién. Sin esta segunda señal el Architect decidía qué es "código muerto"
    // por parecido de nombre (marcó delete sobre MenuSection.tsx creyéndolo de
    // la página Menú, cuando lo renderiza la landing). El grafo se calcula de
    // los contenidos reales — el modelo no tiene que deducir nada.
    const importedByBlock = buildImportedByBlock(files);
    // Initial build of a new project: the scaffolded layout chrome is still in
    // its template state. We detect this deterministically from the placeholder
    // brand string the template ships with — once the first build brands the
    // navbar, "App Name" is gone and this flag is false for every later edit.
    const headerContent = files.get('src/components/layout/Header.tsx') ?? '';
    const isInitialBuild = headerContent.includes('App Name');
    const { steps, wasTrimmed, originalCount, deletionTargets } = await Architect.plan(
      input,
      memoryFormatted,
      intent,
      designContext,
      blueprint,
      importedByBlock,
      isInitialBuild,
      signal
    );

    // Cancelación durante la clasificación/planificación: nada se escribió aún.
    // Cerramos el intent como cancelado (0 archivos) y evitamos que un plan
    // vacío por abort caiga al heavy lane.
    if (signal?.aborted) {
      return await this.finalizeCancelled({
        input, intent, writtenPaths: [], projectId, creditUserId, startTime,
      });
    }

    if (steps.length === 0) {
      // Architect returned nothing — fall back to the legacy heavy lane
      const result = await this.runHeavyLane(input, files, selectedElement, projectId, intent, signal);
      if (result.outcome === 'success' && creditUserId) {
        await this.settleCredits(intent.type, result.tokensInput ?? 0, result.tokensOutput ?? 0, projectId);
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
    const implResult = await Implementer.execute(
      steps,
      files,
      memory!,
      onProgress,
      patternContext,
      designContext,
      signal,
      // CAMBIO 1 — mismo blueprint que recibió el Architect: forma el prefijo
      // estático cacheado compartido entre las tres lanes de esta generación.
      blueprint,
      // Capa 1 → Capa 2: lo que el usuario nombró para eliminar. Es la
      // referencia EXTERNA al plan contra la que el guard mide cada delete; sin
      // ella el plan sólo puede borrar lo que ya estaba huérfano pre-intent.
      deletionTargets
    );
    const modifiedFilesMap = implResult.files;
    const { failedSteps, skippedSteps, deletedPaths, rejectedDeletes } = implResult;

    // Un delete rechazado por el guard de infraestructura no rompe el run (se
    // salta y sigue), así que sin esta marca no dejaría rastro consultable: el
    // console.warn del Implementer vive en el navegador, no en los logs del
    // servidor. Mismo patrón que [PARTIAL:...] — sufijo en el prompt, sin tocar
    // columnas ni enums de forge_intent_log.
    // Cada entrada lleva su motivo (`<path>:<reason>`) porque ya hay dos guards
    // que rechazan deletes y el log es lo único consultable por SQL: sin el
    // sufijo, un delete caído por el guard de huérfanas (still_imported) sería
    // indistinguible de uno caído por infraestructura (undeletable).
    // Los targets se registran SIEMPRE que existan, pasen o no los deletes: son
    // la autorización, y auditar un borrado exige poder contrastar qué se borró
    // contra qué nombró el usuario. Mismo patrón de sufijo que [PARTIAL:...],
    // [DELETE_REJECTED:...] y [RESTORED:...] — sin tocar columnas ni enums.
    const targetsMark = deletionTargetsTelemetry(deletionTargets);
    const rejectedDeleteMark = rejectedDeletes.length > 0
      ? ` [DELETE_REJECTED:${rejectedDeletes.map(r => `${r.path}:${r.reason}`).join(',')}]`
      : '';
    if (rejectedDeletes.length > 0) {
      console.warn('[AIOrchestrator] delete_rejected:', rejectedDeletes);
    }

    // CAMBIO 2 — cancelación durante el plan: el step en vuelo ya se descartó en
    // el Implementer; persistimos SÓLO los steps completos y cerramos el intent
    // como cancelado. NO llamamos al Verifier (no fixes post-cancelación); el
    // preview se recompila solo cuando StudioEngine recibe estos archivos.
    if (implResult.cancelled || signal?.aborted) {
      const writtenPaths = this.persistCompleted(modifiedFilesMap, files, deletedPaths);
      if (projectId && writtenPaths.length > 0) {
        await ProjectMemoryService.updateAfterChange(projectId, writtenPaths, modifiedFilesMap);
      }
      return await this.finalizeCancelled({
        input, intent, writtenPaths, projectId, creditUserId, startTime,
        planSteps: implResult.completedSteps,
      });
    }

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

    // ------------------------------------------------------------------
    // Design-brief guard — if the Implementer's write to src/index.css dropped
    // any part of the brief block (the 5 --brand-* vars, the body background/
    // foreground/font wiring, or the h1–h6 heading font), restore it before the
    // file is persisted. Font families are read from DESIGN.md. Runs before the
    // Verifier so the restored CSS is compile-checked like any other write.
    // ------------------------------------------------------------------
    if (modifiedFilesMap.has('src/index.css')) {
      const { css: guardedCss, guarded, restored } = reinjectBrandBriefIfDropped(
        modifiedFilesMap.get('src/index.css')!,
        files.get('src/index.css'),
        files.get('DESIGN.md')
      );
      if (guarded) {
        modifiedFilesMap.set('src/index.css', guardedCss);
        console.warn(`[AIOrchestrator] Brief guard: restored ${restored.join(', ')} dropped by the Implementer write to src/index.css`);
      }
    }

    // ------------------------------------------------------------------
    // Dependency audit (P0-2) — after the Implementer's writes, ensure every
    // bare import in the written .ts/.tsx is declared in the project's
    // package.json so the exported zip builds outside Wyrd. The preview runtime
    // resolves these via vendor/alias/esm.sh, but an offline `npm install` does
    // not. Deterministic, no LLM. Added to the write set so the update is
    // verified and persisted alongside the step's files.
    // ------------------------------------------------------------------
    const depAudit = this.auditDependencies(modifiedFilesMap, files);
    if (depAudit) {
      modifiedFilesMap.set(depAudit.path, depAudit.content);
    }
    // Lo que tocó la auditoría se recuerda para no confundirlo después con una
    // reparación del Verifier fuera del plan: son causas distintas y merecen
    // mensajes distintos.
    const auditedDeps = depAudit?.added ?? [];
    const auditedPath = depAudit?.path ?? null;

    // ------------------------------------------------------------------
    // LAYER 5 — Verifier: compile-check and auto-fix
    // ------------------------------------------------------------------
    let verifyResult;
    try {
      verifyResult = await Verifier.verify(modifiedFilesMap, files, onRetry, signal, 3, designContext, blueprint, deletedPaths);
    } catch (e) {
      // Cancelación durante el verify: no se lanzan más fixes. Persistimos los
      // steps ya completos (los archivos que el Implementer terminó) y cerramos
      // como cancelado, igual que un abort mid-plan.
      if (isAbortError(e)) {
        const writtenPaths = this.persistCompleted(modifiedFilesMap, files, deletedPaths);
        if (projectId && writtenPaths.length > 0) {
          await ProjectMemoryService.updateAfterChange(projectId, writtenPaths, modifiedFilesMap);
        }
        return await this.finalizeCancelled({
          input, intent, writtenPaths, projectId, creditUserId, startTime,
          planSteps: implResult.completedSteps,
        });
      }
      throw e;
    }

    const finalFiles = verifyResult.files;

    // La restauración determinista es lo único del pipeline cuya CONFIRMACIÓN
    // positiva vivía sólo en la consola del navegador: en Render su firma es
    // una ausencia (el lote no genera línea [repair]), y una ausencia no se
    // consulta por SQL. Mismo patrón que [PARTIAL:...] y [DELETE_REJECTED:...]
    // — sufijo en el prompt del intent log, sin tocar columnas ni enums — así
    // que "qué archivos repuso el verify, y en qué intents" pasa a ser una
    // query sobre forge_intent_log.
    // En un run fallido el verify devuelve el original intacto, así que la marca
    // ahí significa "lo repuso durante los intentos, pero el run no persistió":
    // es justo lo que hay que poder distinguir al consultarlo.
    const restoredMark = (verifyResult.restoredPaths ?? []).length > 0
      ? ` [RESTORED:${(verifyResult.restoredPaths ?? []).join(',')}]`
      : '';

    // El escaneo determinista de referencias post-delete: cuántas veces el
    // Implementer devuelve un descableado INCOMPLETO (borra la página, deja el
    // `<Menu />` en App.tsx). El compile no lo ve —esbuild no reporta
    // identificadores no definidos— así que sin esta marca el diff corto sólo
    // se manifiesta como un preview roto que nadie puede contar. La marca se
    // emite dispare o no el verde final: si una ronda de repair descableó al
    // consumidor, el intent acaba en 'success' y la marca es justo lo que dice
    // que hubo que repararlo. Mismo patrón de sufijo que [PARTIAL:...],
    // [DELETE_REJECTED:...] y [RESTORED:...] — sin tocar columnas ni enums.
    const danglingMark = danglingRefsTelemetry(verifyResult.danglingRefs ?? []);

    if (verifyResult.success) {
      // ----------------------------------------------------------------
      // PIEZA 2 — Diff-write: persistir TODO path cuyo contenido en el
      // resultado del Verifier difiera del original, no sólo los archivos de
      // los steps. El Verifier pudo reparar un error preexistente FUERA del
      // plan (p. ej. ContactSection mientras el plan sólo tocaba HeroSection);
      // esa reparación compiló verde y debe persistir, no descartarse.
      // ----------------------------------------------------------------
      const diffPaths: string[] = [];
      for (const [path, content] of finalFiles) {
        if (!files.has(path) || files.get(path) !== content) {
          if (!diffPaths.includes(path)) diffPaths.push(path);
        }
      }

      // Reparaciones fuera del plan: paths del diff que no son file_path de
      // ningún step. Alimentan el warning honesto.
      const planPaths = new Set(
        steps.map(s => s.file_path).filter((p): p is string => !!p)
      );
      // package.json escrito por la auditoría de dependencias NO es una
      // reparación fuera del plan: es la declaración de un import nuevo. Sale de
      // `extras` para que no herede el mensaje equivocado.
      const extras = diffPaths.filter(p => !planPaths.has(p) && p !== auditedPath);

      // ----------------------------------------------------------------
      // PIEZA 3 — fallo parcial honesto. Algún step murió por sobrecarga
      // temporal del modelo (529 tras agotar reintentos) o quedó saltado por
      // cascada de dependencias. El trabajo válido ya está persistido y
      // compiló, así que el outcome sigue siendo 'success', pero lo avisamos y
      // ofrecemos completar lo que falta.
      // ----------------------------------------------------------------
      const partialSteps: BuildStep[] = [
        ...failedSteps.map(f => f.step),
        ...skippedSteps,
      ];
      const hasPartial = partialSteps.length > 0;
      const partialOrders = partialSteps.map(s => s.order).sort((a, b) => a - b);
      const describeStep = (s: BuildStep): string =>
        s.file_path || s.description?.slice(0, 60) || `paso ${s.order}`;
      const firstFailedStep = failedSteps[0]?.step ?? skippedSteps[0];
      const suggestedAction = hasPartial && firstFailedStep
        ? `Completa lo que faltó: ${firstFailedStep.description}`
        : undefined;

      // ----------------------------------------------------------------
      // PIEZA B — timestamp determinista de migraciones. El modelo emite
      // siempre el 20240101000000 de la documentación de Supabase, así que la
      // segunda migración de un proyecto PISA a la primera en forge_files
      // (clave (project_id, path)). El renombrado ocurre AQUÍ, en el cliente,
      // contra un único instante para todo el lote: el nombre de una migración
      // es su identidad y su orden, no un detalle cosmético, y pedirle la fecha
      // al modelo reintroduce el fallo por otra vía (no sabe qué hora es).
      // Un preexistente EN SU SITIO no se renombra: un intent que MODIFICA una
      // migración previa debe escribir sobre ella, no duplicarla.
      // ----------------------------------------------------------------
      // CIRUGÍA 2.2 — el DIRECTORIO también se resuelve aquí, no lo elige el
      // modelo. `supabase/migrations/` es el prefijo del que cuelga TODO lo que
      // reconoce una migración (el renombrado, la marca [DDL_PROPOSED:], el
      // botón de aprobación, el contexto de schema que vuelve al modelo), y la
      // única regla de prompt que lo nombraba no llega al plan lane — que es
      // justo la lane a la que laneRouting manda siempre un database_change.
      // Un proyecto real escribió `src/db/migrations/…` y la cadena entera se
      // apagó sin un solo aviso. La normalización se activaba sólo en los
      // intents `database_change`; C-D le añade la vía por contenido (ver el
      // gate más abajo), porque un .sql que llega al plan bajo otra etiqueta
      // esquivaba el barrido entero.
      //
      // C-D'' — EL BARRIDO. `diffPaths` sólo contiene lo que el modelo tocó en
      // ESTE intent, así que la recuperación de C-D' —que ya funciona— sólo
      // disparaba si el modelo reescribía el huérfano, cosa que no tiene motivo
      // para hacer. El checkpoint sobre el proyecto 510afe69 lo enseñó en vivo:
      // la migración nueva normalizó perfecta y `create_pedidos_c2.sql`
      // sobrevivió sin entrar jamás a la función. Los candidatos se barren del
      // mapa COMPLETO del proyecto (estado pre-intent) y se unen a la entrada:
      // C-D' enseñó al sistema a reparar lo que ve, esto le enseña a mirar.
      //
      // C-D — EL GATE YA NO ES SÓLO LA ETIQUETA. Sigue entrando todo
      // `database_change` (un intent así activa el barrido aunque su plan aún
      // no traiga un path reconocible), y AL LADO entra el CONTENIDO: si el
      // lote toca migraciones —cualquier `.sql`, o cualquier cosa bajo
      // `supabase/migrations/`— se barre diga lo que diga el clasificador. La
      // etiqueta la produce un LLM, y un `.sql` que llegaba al plan bajo otro
      // intent_type esquivaba el barrido ENTERO. Es un OR: añade activaciones,
      // no quita ninguna. Y dos exclusiones, ambas cinturón:
      //  - lo que ya viene en `diffPaths` no se añade dos veces (el modelo
      //    reescribió el huérfano): una sola escritura, con el contenido nuevo.
      //  - lo que el plan BORRÓ no se resucita: un huérfano que este intent
      //    eligió eliminar no es un archivo que haya que recolocar.
      const sweptOrphans = (intent.type === 'database_change' || touchesMigrations(diffPaths))
        ? orphanMigrationCandidates(files).filter(
            p => !diffPaths.includes(p) && !deletedPaths.includes(p)
          )
        : [];
      if (sweptOrphans.length > 0) {
        console.log('[AIOrchestrator] huérfanos .sql barridos del proyecto:',
          sweptOrphans.join(', '));
      }
      // La entrada real de la normalización, y también la lista que se recorre
      // al persistir: un huérfano barrido tiene que ESCRIBIRSE en su destino,
      // no sólo aparecer en el mapa de renombrados.
      const migrationInputPaths = [...diffPaths, ...sweptOrphans];

      const migrationRenames = resolveMigrationTargets(migrationInputPaths, files, Date.now(), {
        normalizeDir: intent.type === 'database_change' || touchesMigrations(migrationInputPaths),
      });
      if (migrationRenames.size > 0) {
        console.log('[AIOrchestrator] migraciones colocadas en su sitio real:',
          [...migrationRenames].map(([from, to]) => `${from} -> ${to}`).join(', '));
      }

      // Notify StudioEngine about each modified file. `persistedPaths` son los
      // paths REALMENTE escritos (post-renombrado): es lo que ve el usuario, lo
      // que viaja a modified_files y lo que MigrationRunner tendrá que leer de
      // forge_files, así que a partir de aquí diffPaths ya no es la lista de lo
      // persistido.
      // C-D' — un rename cuyo ORIGEN ya existía en el proyecto es una
      // RECUPERACIÓN, y una recuperación tiene dos mitades: escribir el destino
      // y VACIAR el origen. Sin la segunda, forge_files se queda con las dos
      // filas —la nueva y la vieja con su contenido antiguo— y el proyecto
      // acaba con la migración duplicada, que es justo el fallo que el
      // renombrado existía para evitar. `files` es el mapa PRE-intent, así que
      // `files.has(path)` es exactamente "esta fila ya estaba en forge_files".
      const persistedPaths: string[] = [];
      const vacatedPaths: string[] = [];
      for (const path of migrationInputPaths) {
        // C-D'' — DE DÓNDE SALE EL CONTENIDO DE UN HUÉRFANO BARRIDO.
        //
        // Hoy `finalFiles` es el mapa COMPLETO del proyecto: el Verifier
        // arranca de `new Map(originalFiles)` y cada reparación devuelve otra
        // copia entera, así que un huérfano que el modelo no tocó sigue ahí con
        // su contenido original —que es exactamente por qué no entró a
        // `diffPaths`—. Para un path barrido, entonces, los dos mapas dicen lo
        // mismo, y `files` es la caída explícita por si esa propiedad del
        // Verifier deja de cumplirse: un huérfano se escribe con el contenido
        // que tiene, venga del mapa que venga, y nunca con `undefined`.
        //
        // Para todo lo demás `finalFiles` manda —incluido el huérfano que el
        // modelo SÍ reescribió, que entra una sola vez (por `diffPaths`) y con
        // el contenido nuevo, no con el viejo.
        const content = finalFiles.get(path) ?? files.get(path)!;
        const target = migrationRenames.get(path) ?? path;
        this.notifyFileUpdate(target, content);
        persistedPaths.push(target);
        if (target !== path && files.has(path)) vacatedPaths.push(path);
      }
      // Los pares (viejo → nuevo) que de verdad recuperaron un archivo que ya
      // vivía fuera de sitio. Alimenta el aviso al usuario: antes se le pedía
      // recrear la migración a mano, ahora se le dice dónde quedó.
      const recoveredMigrations = vacatedPaths.map(
        (from): [string, string] => [from, migrationRenames.get(from)!]
      );
      if (recoveredMigrations.length > 0) {
        console.log('[AIOrchestrator] migraciones preexistentes recuperadas:',
          recoveredMigrations.map(([from, to]) => `${from} -> ${to}`).join(', '));
      }

      // ----------------------------------------------------------------
      // EL MAPA QUE VE LA MEMORIA ES EL DE DESPUÉS DEL RENOMBRADO.
      //
      // `finalFiles` sale del Verifier, que nunca supo del renombrado: sus
      // claves son las de ANTES de normalizar. `ProjectMemoryService`
      // recalcula `database_schema` recorriendo ESE mapa y filtrando por
      // `supabase/migrations/`, así que una migración recolocada entraba en la
      // memoria por su path VIEJO —el que no empieza por el prefijo— y
      // desaparecía del schema. El archivo quedaba escrito y aprobable en
      // forge_files y a la vez INVISIBLE para el contexto que vuelve al
      // modelo: el mismo silencio que la normalización vino a matar,
      // sobreviviendo un paso más abajo, en el único consumidor que leía el
      // mapa en crudo en vez de `persistedPaths`.
      //
      // La normalización SÍ produce el mapa viejo→nuevo (`migrationRenames`);
      // lo que faltaba era consumirlo aquí. El contenido se resuelve con la
      // MISMA caída que la persistencia (`finalFiles` manda, `files` es el
      // respaldo del huérfano barrido), así que memoria y forge_files no
      // pueden divergir.
      //
      // El origen se VACÍA, y en dos pasadas: dejarlo contaría dos veces la
      // misma migración en el schema cuando el renombrado ocurre DENTRO del
      // prefijo —viejo y nuevo empiezan igual, los dos pasan el filtro— y
      // dejaría en la memoria un path que en el proyecto ya no existe. Los
      // borrados van después de todas las escrituras porque un destino de este
      // lote podría, en el límite, coincidir con el origen de otro.
      // ----------------------------------------------------------------
      const memoryFiles = new Map(finalFiles);
      for (const [from, to] of migrationRenames) {
        memoryFiles.set(to, finalFiles.get(from) ?? files.get(from)!);
      }
      for (const from of migrationRenames.keys()) memoryFiles.delete(from);

      // ----------------------------------------------------------------
      // PIEZA A — gate de propuesta. Un intent 'database_change' que dejó al
      // menos una migración escrita NO ha tocado la base de datos: la
      // generación jamás ejecuta DDL. Antes, ese intent cerraba en 'success'
      // con el archivo persistido y nada distinguía "la tabla existe" de "hay
      // un .sql esperando a que alguien lo apruebe". La marca es ese rastro, y
      // es lo único que este intent produce respecto de la base.
      // Mismo mecanismo que restoredMark / danglingMark: sufijo concatenado a
      // user_prompt, sin columnas nuevas ni valores de enum nuevos.
      // ----------------------------------------------------------------
      const ddlProposedMark = intent.type === 'database_change'
        ? ddlProposedTelemetry(persistedPaths.filter(isMigrationPath))
        : '';

      // ----------------------------------------------------------------
      // CIRUGÍA 2.2 — GUARDA DE LA NORMALIZACIÓN.
      //
      // Si tras colocar los .sql queda alguno fuera del prefijo, sólo puede ser
      // uno que YA existía ahí (los nuevos los recoloca resolveMigrationTargets;
      // los preexistentes no se mueven porque moverlos es borrar y recrear a
      // espaldas del usuario). Ese archivo es invisible para el botón de
      // aprobación y para el contexto de schema, y ANTES no lo decía nadie:
      // se escribía, el intent cerraba en 'success' y la cadena moría callada.
      // Ahora deja rastro en el log y aviso en el chat.
      // ----------------------------------------------------------------
      const misplacedSql = intent.type === 'database_change'
        ? misplacedMigrations(persistedPaths)
        : [];
      const ddlMisplacedMark = misplacedSql.length > 0
        ? ` [DDL_MISPLACED:${misplacedSql.join(',')}]`
        : '';
      if (misplacedSql.length > 0) {
        console.warn(
          '[AIOrchestrator] .sql fuera de supabase/migrations/ (preexistente, no se mueve):',
          misplacedSql.join(', ')
        );
      }

      // Notify StudioEngine about each DELETED file. This needs its own bridge:
      // diffPaths is built by iterating finalFiles, which by definition can no
      // longer contain a path that was deleted — without this loop the plan's
      // delete steps die in memory and the file survives in forge_files.
      // Un path que el repair RECREÓ deja de ser un borrado: el plan lo borró de
      // más (otro archivo seguía importándolo) y la recreación ES la corrección
      // de ese plan. Sin este filtro el notifyFileDelete de abajo vuelve a
      // borrarlo en forge_files justo después de que notifyFileUpdate lo
      // escribiera, y el proyecto queda otra vez sin el archivo.
      // Un delete revertido lo es por las dos vías: `restoredPaths` (el verify
      // repuso el contenido EXACTO desde el mapa original, sin modelo) y
      // `recreatedPaths` (lo escribió el modelo). El descuento sobre los
      // borrados es idéntico en ambos casos — el archivo vuelve a estar en el
      // proyecto y no debe re-borrarse en forge_files.
      const recreatedByRepair = new Set([
        ...(verifyResult.recreatedPaths ?? []),
        ...(verifyResult.restoredPaths ?? []),
      ]);
      const revertedDeletes = deletedPaths.filter(p => recreatedByRepair.has(p));
      if (revertedDeletes.length > 0) {
        console.warn('[AIOrchestrator] delete revertido por el repair (el archivo seguía en uso):',
          revertedDeletes.join(', '));
      }
      const erasedPaths = deletedPaths.filter(p => files.has(p) && !recreatedByRepair.has(p));
      // C-D' — los orígenes vaciados por una recuperación salen de forge_files
      // por el MISMO puente que los borrados del plan, no por un mecanismo
      // propio: un path que deja de existir en el proyecto es un path que deja
      // de existir, venga de un delete step o de un rename. Entrar por aquí es
      // lo que les da el trato completo río abajo —notifyFileDelete, el
      // re-indexado de la memoria y modified_files— en vez de esquivarlo.
      // `erasedPaths` (deletes del plan, ausentes de finalFiles) y
      // `vacatedPaths` (orígenes de rename) siguen siendo disjuntos: un origen
      // vacío viene de `diffPaths` —y un delete que reaparece en finalFiles es
      // un delete revertido, ya descontado arriba— o de `sweptOrphans`, que
      // excluye `deletedPaths` justo para esto. El Set es cinturón, no lógica.
      const removedPaths = [...new Set([...erasedPaths, ...vacatedPaths])];
      for (const path of removedPaths) {
        this.notifyFileDelete(path);
      }

      // Deduct credits for main pipeline
      if (creditUserId) {
        await this.settleCredits(
          intent.type,
          verifyResult.tokensInput ?? 0,
          verifyResult.tokensOutput ?? 0,
          projectId
        );
      }

      // Update memory and record success
      if (projectId) {
        trackAICall(projectId);
        // Deleted paths go in too: updateAfterChange drops every listed path
        // from the component registry before re-indexing, and a deleted file
        // re-indexes to nothing (memoryFiles.get -> undefined), so listing it is
        // exactly how its components leave the registry.
        await ProjectMemoryService.updateAfterChange(projectId, [...persistedPaths, ...removedPaths], memoryFiles);
        await ProjectMemoryService.recordAction(projectId, {
          action: input.slice(0, 120),
          outcome: 'success',
        });
        await this.logIntent({
          projectId,
          // PIEZA 3 — telemetría de fallo parcial: mismo patrón que
          // [CLARIFY_ASKED], sufijo en el prompt, sin tocar columnas ni enums.
          prompt: (hasPartial ? `${input} [PARTIAL:${partialOrders.join(',')}]` : input) +
            targetsMark + rejectedDeleteMark + restoredMark + danglingMark + ddlProposedMark +
            ddlMisplacedMark,
          intentType: intent.type,
          intentRisk: intent.risk,
          planSteps: steps,
          modifiedFiles: [...persistedPaths, ...removedPaths],
          affectedFiles: intent.affected_files,
          outcome: 'success',
          // PIEZA 4 — telemetría cableada: compiló, sin error.
          compileAttempts: verifyResult.attempts,
          errorMessage: null,
          durationMs: Date.now() - startTime,
          requiredPatternIds: intent.requiredPatternIds,
          domain: intent.domain,
        });
      }

      this.lastModifiedFiles = persistedPaths;

      // ----------------------------------------------------------------
      // PIEZA 3 — fin del éxito falso. "No files needed changing" SÓLO es
      // honesto cuando no se persistió nada Y el proyecto compiló limpio a la
      // primera (attempts === 1). Si hubo reparaciones (diff no vacío) o
      // intentos extra, el mensaje debe reflejarlo.
      // ----------------------------------------------------------------
      const warnings: string[] = [];
      if (wasTrimmed) {
        warnings.push(
          `This request needed ${originalCount} steps. Only the first 6 were built. Send a follow-up to continue.`
        );
      }
      if (extras.length > 0) {
        warnings.push(`Reparé además un error preexistente en: ${extras.join(', ')}`);
      }
      if (auditedDeps.length > 0) {
        // No es una reparación: el código nuevo importa estos paquetes y sin
        // declararlos el zip exportado no instalaría. Decir "reparé un error
        // preexistente en package.json" describía la causa equivocada.
        warnings.push(
          `Añadí ${auditedDeps.join(', ')} a package.json porque el código nuevo ` +
          `${auditedDeps.length === 1 ? 'lo importa' : 'los importa'}.`
        );
      }
      if (erasedPaths.length > 0) {
        warnings.push(`Eliminé del proyecto: ${erasedPaths.join(', ')}`);
      }
      if (revertedDeletes.length > 0) {
        warnings.push(
          `Restauré ${revertedDeletes.join(', ')}: el plan lo borró pero seguía en uso.`
        );
      }
      if (diffPaths.length === 0 && verifyResult.attempts > 1) {
        // Caso raro: hubo reparación durante el verify pero el resultado neto no
        // difiere del original. No lo reportamos como éxito plano.
        warnings.push(
          'Detecté y corregí errores de compilación durante la verificación.'
        );
      }
      // C-D' — el aviso cambia de tiempo verbal. Antes esto sólo podía decir
      // "está fuera de sitio, pídeme que la vuelva a crear": la máquina veía el
      // archivo huérfano y le pasaba la reparación al usuario. Ahora la hace, y
      // lo que se reporta es dónde quedó — el path final es lo que el usuario
      // necesita para reconocerla en el explorador y en el botón de aprobación.
      if (recoveredMigrations.length > 0) {
        warnings.push(
          `Moví ${recoveredMigrations.map(([from, to]) => `${from} → ${to}`).join(', ')}: ` +
          `fuera de supabase/migrations/ el sistema no la reconocía como migración ` +
          `y no podía ofrecerte aplicarla desde el chat.`
        );
      }
      // Lo que sobrevive a la recuperación ya no debería existir para un
      // database_change (todo .sql del lote acaba bajo el prefijo). Se queda
      // como checkpoint mecánico: si algún día vuelve a dispararse, es la señal
      // de que la normalización dejó de cubrir un caso, y decirlo sigue siendo
      // mejor que el silencio de antes.
      if (misplacedSql.length > 0) {
        warnings.push(
          `${misplacedSql.join(', ')} está fuera de supabase/migrations/, así que no puedo ` +
          `ofrecerte aplicarla desde el chat. Pídeme que la vuelva a crear y la escribiré en su sitio.`
        );
      }
      if (hasPartial) {
        const total = steps.length;
        const completedCount = total - partialSteps.length;
        const failedList = partialSteps.map(describeStep).join(', ');
        warnings.push(
          `Generé ${completedCount} de ${total} pasos. Falló: ${failedList} ` +
          `por sobrecarga temporal del modelo. Puedes pedirme completar lo que falta.`
        );
      }

      return {
        modifiedFiles: persistedPaths,
        steps,
        outcome: 'success',
        warning: warnings.length > 0 ? warnings.join(' ') : undefined,
        suggestedAction,
      };
    } else {
      // ----------------------------------------------------------------
      // PIEZA 3 — verify falló: outcome 'failed', NO persistir nada nuevo,
      // mensaje honesto con la misma taxonomía del SimpleLane. Si el archivo
      // culpable está FUERA de los archivos del plan, decirlo explícitamente.
      // ----------------------------------------------------------------
      const errorMsg = verifyResult.error ?? 'Unknown compilation error';
      const errorFile = verifyResult.errorFile ?? null;
      const planPaths = new Set(
        steps.map(s => s.file_path).filter((p): p is string => !!p)
      );
      const honest =
        errorFile && !planPaths.has(errorFile)
          ? `No pude aplicar el cambio: existe un error de compilación previo en ${errorFile} que no logré reparar automáticamente. Error: ${errorMsg.slice(0, 200)}`
          : `No pude aplicar el cambio sin romper la compilación. Error: ${errorMsg.slice(0, 200)}`;

      // Verification failed after all retries — record failure and return error
      if (projectId) {
        await ProjectMemoryService.recordAction(projectId, {
          action: input.slice(0, 120),
          outcome: 'failed',
        });
        await this.logIntent({
          projectId,
          prompt: input + targetsMark + rejectedDeleteMark + restoredMark + danglingMark,
          intentType: intent.type,
          intentRisk: intent.risk,
          planSteps: steps,
          modifiedFiles: [],
          affectedFiles: intent.affected_files,
          outcome: 'failed',
          // PIEZA 4 — telemetría cableada: intentos reales + error real.
          compileAttempts: verifyResult.attempts,
          errorMessage: errorMsg,
          durationMs: Date.now() - startTime,
          requiredPatternIds: intent.requiredPatternIds,
          domain: intent.domain,
        });
      }

      return {
        modifiedFiles: [],
        steps,
        outcome: 'failed',
        error: honest,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Fast lane — direct /api/ai-action call for style/text tweaks
  // -------------------------------------------------------------------------

  private static async runFastLane(
    input: string,
    files: Map<string, string>,
    selectedElement: { tagName: string; className?: string; filePath?: string; ordinal?: number; dataOid?: string },
    signal?: AbortSignal
  ): Promise<OrchestratorResult> {
    // CAMBIO 4 — target the real file the selection resolved to (no hardcode). The
    // caller only enters the fast lane when filePath is set and exists.
    const filePath = selectedElement.filePath;
    if (!filePath) return { modifiedFiles: [] };
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
        signal,
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
      if (isAbortError(e)) return { modifiedFiles: [], outcome: 'cancelled' };
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
    projectId?: string,
    signal?: AbortSignal,
    previousClarifyQuestion?: string | null
  ): Promise<OrchestratorResult> {
    const target = await this.resolveTarget(input, files, selectedElement, intent, signal, previousClarifyQuestion);
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

    // Design context (incl. the mandatory DESIGN.md brief) must reach the simple
    // lane edit too, so a one-off tweak still honors the project's palette,
    // fonts and anti-template rules. Non-blocking: getContext swallows failures.
    const designContext = await DesignContextService.getContext(input, files);

    // Site data contract: always surface src/data/site.ts (single source of
    // truth for contact/brand facts, ~15 lines, fixed shape) so a one-off edit
    // consumes siteInfo with the exact field shapes and never assumes a shape it
    // never saw. Skip only when the edit target IS site.ts (already in CONTENT).
    const siteTs = files.get('src/data/site.ts');
    const siteBlock =
      siteTs && target.path !== 'src/data/site.ts'
        ? `\n\nSITE DATA CONTRACT (src/data/site.ts — import facts from here; use these EXACT field shapes. hours is an array of {days, open, close}):\n${siteTs}`
        : '';

    // REMATE — prompt caching en el simple lane (mismo patrón del plan lane): el
    // prefijo ESTABLE (reglas + brief) es byte-idéntico al del
    // Architect/Implementer/Verifier de esta generación Y entre intents en este
    // proyecto, así que el primer edit lo escribe una vez a cache y las llamadas
    // siguientes de la ventana de 5 min (incl. el primer Sonnet del siguiente
    // intent y las reparaciones del Verifier que dispara abajo) lo leen como
    // cache_read en vez de re-facturarlo. El blueprint mutable va en su propio
    // bloque después del prefijo estable para no romper ese cache_read cruzado.
    // REACT_TAILWIND_RULES ya incluye el AVAILABLE RUNTIME, por eso ya no se
    // antepone aparte. El Task (archivo + cambio pedido) viaja en el user message.
    const blueprint = generateBlueprintFromFiles(files);
    const stablePrefix = buildProjectContextPrefix(designContext);
    const blueprintBlock = buildBlueprintBlock(blueprint);
    const roleBlock =
      'You are a React/Tailwind expert. The user wants a simple change. ' +
      'Return ONLY the complete updated file content. No explanation, ' +
      'no markdown fences. Just the raw file starting from line 1. ' +
      'Never write the file path as the first line of the file content. File ' +
      'content must start directly with code (imports, comments, or declarations).' +
      siteBlock;

    try {
      const response = await platformService.callForgeChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: cachedSystemBlocks(stablePrefix, blueprintBlock, roleBlock),
        messages: [
          {
            role: 'user',
            content: `FILE: ${target.path}\n\nCONTENT:\n${target.content}\n\nCHANGE REQUESTED: ${input}`,
          },
        ],
      }, signal);

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
      // CAMBIO 1 — Verifier post-edición: compilar el cambio antes de escribir,
      // entrando al MISMO ciclo de reparación por lotes del plan lane (misma
      // función Verifier.verify), pero con tope de 2 intentos: una edición
      // puntual sólo amerita una ronda de reparación por lotes. compile_attempts
      // y error_message se pueblan igual que en el plan lane.
      // ----------------------------------------------------------------
      const verifyResult = await Verifier.verify(
        new Map([[target.path, newContent]]),
        files,
        undefined,
        signal,
        2,
        // REMATE — reparaciones Sonnet del simple lane comparten el prefijo
        // cacheado (reglas + brief) igual que el plan lane. Es el MISMO
        // stablePrefix del edit de arriba, así que se sirve desde cache; el
        // blueprint mutable lo reconstruye el Verifier en su propio bloque.
        designContext,
        blueprint
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
          compileAttempts: verifyResult.attempts,
          warning: otherPaths.length > 0
            ? `Reparé además un error preexistente en: ${otherPaths.join(', ')}`
            : undefined,
        };
      }

      // CAMBIO 1 — fallo tras los intentos del Verifier: NO persistir el estado
      // roto. El simple lane nunca llamó notifyFileUpdate antes del éxito, así
      // que el preview conserva el contenido previo del archivo: el revert es
      // efectivo (nada roto llegó nunca al preview). Cerramos con outcome
      // 'failed', error_message real y un mensaje honesto que dice que se revirtió.
      const errorMsg = verifyResult.error ?? 'Unknown compilation error';
      const errorFile = verifyResult.errorFile ?? null;
      const honest =
        errorFile && errorFile !== target.path
          ? `El cambio no compiló y lo revertí: existe un error de compilación previo en ${errorFile} que no logré reparar automáticamente. Error: ${errorMsg.slice(0, 200)}`
          : `El cambio no compiló y lo revertí: ${errorMsg.slice(0, 200)}`;

      return {
        modifiedFiles: [],
        outcome: 'failed',
        error: honest,
        compileAttempts: verifyResult.attempts,
      };
    } catch (e) {
      // Cancelación: el simple lane no persiste nada hasta el éxito, así que un
      // abort deja 0 archivos. Cerramos como cancelado (no como fallo).
      if (isAbortError(e)) {
        return {
          modifiedFiles: [],
          outcome: 'cancelled',
          chatResponse: 'Generación cancelada — se conservaron 0 archivos completados.',
        };
      }
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
    intent: Intent,
    signal?: AbortSignal,
    previousClarifyQuestion?: string | null
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
      // REMATE (caché del Haiku de targeting): NO se cachea a propósito. El
      // prompt es mayormente dinámico — el grueso de los ~3.8k tokens de input
      // es el contenido de los archivos candidatos (cada uno recortado a 1500
      // chars, varios por edición), que cambia en cada llamada. La única parte
      // estática es el system (~580 tokens), muy por debajo del piso de caché de
      // Haiku (2048 tokens), así que marcarlo con cache_control no produciría
      // ningún cache_read. Se deja como está (ver criterio del remate).
      // La llamada de targeting NUNCA debe romper el lane: try/catch → nivel 3.
      try {
        let userMessage = `USER REQUEST: ${input}`;
        // CAMBIO 5 — the user is answering a prior clarification: echo the question
        // and forbid re-asking, so this turn resolves to a file instead of looping.
        if (previousClarifyQuestion) {
          userMessage =
            `PREVIOUS CLARIFYING QUESTION (you asked this last turn; the USER REQUEST below is their answer — ` +
            `do NOT ask for clarification again, use their answer to pick the file): ${previousClarifyQuestion}\n\n` +
            userMessage;
        }
        for (const path of cappedCandidates) {
          const content = files.get(path) ?? '';
          userMessage += `\n\n--- ${path} ---\n${content.slice(0, 1500)}`;
        }

        const response = await platformService.callForgeChat({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system:
            (previousClarifyQuestion
              ? 'The user is answering a clarifying question you asked last turn — you MUST choose a file now and MUST NOT return "clarify" again. '
              : '') +
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
        }, signal);

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
        // Una cancelación no debe degradar a keywords (eso dispararía la edición):
        // se propaga para que runSimpleLane la cierre como cancelada.
        if (isAbortError(e)) throw e;
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
    startTime: number,
    intent: Intent,
    signal?: AbortSignal
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
      // CAMBIO 1 — el prefijo estático (rol + reglas de formato) no cambia entre
      // preguntas, así que se marca cacheable: la 1ª pregunta lo escribe a cache
      // y las siguientes de la ventana lo leen como cache_read. El contexto por
      // proyecto (blueprint + memoria + archivos + pregunta) viaja en el user
      // message, fuera del prefijo cacheado.
      const response = await platformService.callForgeChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: cachedSystem(systemPrompt),
        messages: [
          ...priorMessages,
          { role: 'user' as const, content: contextBlock },
        ],
      }, signal);

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

      // Settle credits (same accounting as runSimpleLane).
      if (creditUserId) {
        await this.settleCredits(
          'question',
          data.usage?.input_tokens ?? 0,
          data.usage?.output_tokens ?? 0,
          projectId
        );
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
      if (isAbortError(e)) {
        return {
          modifiedFiles: [],
          outcome: 'cancelled',
          chatResponse: 'Generación cancelada.',
        };
      }
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
    projectId?: string,
    intent?: Intent,
    signal?: AbortSignal
  ): Promise<OrchestratorResult> {
    // CAMBIO 1 — the classifier's affected_files are the TARGET files this edit
    // will touch; they reach the model with their COMPLETE content (no 3000-char
    // slice), which is exactly what the "código incompleto" bug needed.
    const relevantFiles = selectRelevantFiles(input, files, intent?.affected_files ?? []);
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
      projectDbContext + emailContext + '\n\n' +
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
      const rawResponse = await this.callLLMWithUsage(userMessage, systemPrompt, [], signal);
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
      if (isAbortError(error)) return { modifiedFiles: [], outcome: 'cancelled' };
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
    priorMessages: { role: 'user' | 'assistant'; content: string }[] = [],
    signal?: AbortSignal
  ): Promise<string> {
    const result = await this.callLLMWithUsage(userMessage, systemPrompt, priorMessages, signal);
    return result.text;
  }

  static async callLLMWithUsage(
    userMessage: string,
    systemPrompt: string,
    priorMessages: { role: 'user' | 'assistant'; content: string }[] = [],
    signal?: AbortSignal
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
      }, signal);

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
      // Cancelación: propagar para que el heavy lane la cierre como cancelada,
      // en vez de disfrazarla de "modifiedFiles: []" (que se leería como éxito).
      if (isAbortError(error)) throw error;
      console.error('[AIOrchestrator] Error calling LLM:', error);
      return { text: JSON.stringify({ modifiedFiles: [] }), tokensInput: 0, tokensOutput: 0 };
    }
  }

  // -------------------------------------------------------------------------
  // CAMBIO 1 — Fix dirigido con contexto automático
  //
  // Construye el prompt del botón "Corregir con AI" de un 'preview-runtime-error'
  // con: el error + stack, el CONTENIDO COMPLETO del archivo implicado y hasta 3
  // imports directos de proyecto (relativos/@), priorizando los que aparecen en
  // el stack. Instrucción explícita de fix mínimo. Si el archivo no se resuelve,
  // degrada al comportamiento actual (solo error + stack). El prompt viaja DENTRO
  // del flujo del intent normal — el simple lane lo procesa con su targeting.
  // -------------------------------------------------------------------------

  static buildRuntimeErrorFixPrompt(
    errorInfo: {
      message?: string;
      filename?: string;
      lineno?: number;
      componentName?: string;
      componentStack?: string;
      stack?: string;
    },
    files: Map<string, string>,
    memory: ProjectMemory | null
  ): string {
    const { message, filename, lineno, componentName, componentStack, stack } = errorInfo;
    const where = componentName || filename || 'el preview';

    const MINIMAL_INSTRUCTION =
      'Fix ONLY the reported error with the minimal change. Do not rebuild or ' +
      'rewrite components beyond what the error requires.';

    const header = [
      'Corrige este error de runtime que ocurre en el preview.',
      MINIMAL_INSTRUCTION,
      '',
      `Error: ${message ?? '(sin mensaje)'}`,
      `Ubicación: ${where}${lineno ? `:${lineno}` : ''}`,
      // CAMBIO 2 — dieta del fix-prompt: el stack se recorta a 5 frames útiles.
      // Los frames profundos (runtime de React, bundler) rara vez señalan el bug
      // del usuario y sólo inflan el prompt; los 5 primeros bastan para ubicarlo.
      stack ? `\nStack:\n${this.trimStack(stack)}` : '',
      componentStack ? `\nComponent stack:\n${this.trimStack(componentStack)}` : '',
    ];

    // a. Resolver el archivo implicado.
    const resolvedPath = this.resolveErrorFilePath(errorInfo, files, memory);
    if (!resolvedPath) return header.filter(Boolean).join('\n'); // degradar

    const fileContent = files.get(resolvedPath) ?? '';

    // b. Imports directos de proyecto (máx 3), priorizando los del stack.
    const importPaths = this.resolveDirectProjectImports(resolvedPath, fileContent, files);
    const stackText = `${componentStack ?? ''}\n${stack ?? ''}`;
    const extra = this.prioritizeByStack(importPaths, stackText).slice(0, 3);

    const parts = [
      ...header,
      `\nArchivo implicado (${resolvedPath}) — CONTENIDO COMPLETO:\n${fileContent}`,
    ];
    // CAMBIO 2 — dieta del fix-prompt: los imports que son PRIMITIVAS DEL TEMPLATE
    // (components/motion/*, lib/utils, components/ui/*) casi nunca son la causa del
    // error y su fuente completa es cara. Van como FIRMA (nombre + props del
    // interface) para que el modelo sepa cómo usarlos sin pagar su cuerpo. El
    // archivo objetivo y los imports NO primitivos siguen en contenido completo.
    for (const p of extra) {
      const content = files.get(p) ?? '';
      if (this.isTemplatePrimitive(p)) {
        parts.push(`\nImport (primitiva del template ${p}) — FIRMA:\n${this.extractSignature(content)}`);
      } else {
        parts.push(`\nImport directo (${p}):\n${content}`);
      }
    }
    return parts.filter(Boolean).join('\n');
  }

  /**
   * CAMBIO 2 — ¿es este path una primitiva del template? Son los building blocks
   * que el scaffold provee y que el usuario rara vez rompe: envoltorios de
   * animación (components/motion/*), el helper cn() (lib/utils) y los primitivos
   * shadcn (components/ui/*). Para el fix basta su FIRMA, no su fuente.
   */
  private static isTemplatePrimitive(path: string): boolean {
    return (
      path.startsWith('src/components/motion/') ||
      path.startsWith('src/components/ui/') ||
      path.startsWith('src/lib/utils')
    );
  }

  /**
   * CAMBIO 2 — firma pública de un módulo: sus declaraciones exportadas
   * (function/const/class, sólo la línea de declaración) y los bloques completos
   * de interface/type exportados (donde vive la forma de las props). Extracción
   * determinista por líneas, sin LLM. Da al modelo cómo se LLAMA e INVOCA cada
   * export sin arrastrar su implementación.
   */
  private static extractSignature(content: string): string {
    if (!content.trim()) return '// (módulo vacío)';
    const lines = content.split('\n');
    const out: string[] = [];
    let braceDepth = 0;
    let capturing = false;

    for (const line of lines) {
      if (capturing) {
        out.push(line);
        braceDepth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
        if (braceDepth <= 0) { capturing = false; braceDepth = 0; }
        continue;
      }
      const trimmed = line.trim();
      // Bloque interface/type exportado: capturar completo (la forma de las props).
      if (/^export\s+(interface|type)\b/.test(trimmed)) {
        out.push(line);
        braceDepth = (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
        // Un `type X = ...;` de una sola línea no abre llaves: no entra en captura.
        capturing = braceDepth > 0;
        continue;
      }
      // Declaración function/const/class exportada: sólo la firma, sin cuerpo.
      if (/^export\s+(default\s+)?(abstract\s+)?(function|const|let|class)\b/.test(trimmed)) {
        out.push(line.replace(/\s*[{=]\s*$/, '').replace(/\s*=>\s*$/, '').trimEnd());
        continue;
      }
    }

    return out.length > 0 ? out.join('\n') : '// (sin exports detectables)';
  }

  /**
   * CAMBIO 2 — recorta un stack (JS `error.stack` o React componentStack) a los
   * primeros `maxFrames` frames útiles, conservando las líneas de mensaje (no
   * frame) del encabezado. Señala cuántos frames se omitieron.
   */
  private static trimStack(stack: string, maxFrames = 5): string {
    const lines = stack.split('\n');
    const out: string[] = [];
    let frames = 0;
    let dropped = 0;
    for (const line of lines) {
      const isFrame = /^\s*(at\b|in\b)/.test(line);
      if (isFrame) {
        if (frames >= maxFrames) { dropped++; continue; }
        frames++;
      }
      out.push(line);
    }
    if (dropped > 0) out.push(`    … (${dropped} frame(s) más omitidos)`);
    return out.join('\n').trim();
  }

  /**
   * Resuelve el path del archivo que originó el error de runtime. Prioridad:
   * (1) componentName / nombres del componentStack → component_registry de la
   * project memory; (2) fallback: nombre de componente ↔ nombre de archivo en
   * los files; (3) fallback: basename del filename del payload.
   */
  private static resolveErrorFilePath(
    errorInfo: { componentName?: string; componentStack?: string; filename?: string },
    files: Map<string, string>,
    memory: ProjectMemory | null
  ): string | null {
    const { componentName, componentStack, filename } = errorInfo;

    const names: string[] = [];
    if (componentName) names.push(componentName);
    if (componentStack) {
      // React componentStack: líneas tipo "    in Foo (created by Bar)".
      const re = /(?:^|\n)\s*(?:in|at)\s+([A-Z][A-Za-z0-9_]*)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(componentStack)) !== null) names.push(m[1]);
    }

    // 1. component_registry (nombre → path).
    const registry = memory?.component_registry ?? [];
    for (const name of names) {
      const hit = registry.find(e => e.name === name);
      if (hit && files.has(hit.path)) return hit.path;
    }

    // 2. Fallback: nombre de componente ↔ basename de archivo.
    for (const name of names) {
      for (const path of files.keys()) {
        if (!path.startsWith('src/')) continue;
        const base = path.split('/').pop() ?? '';
        if (base === `${name}.tsx` || base === `${name}.ts` || base === `${name}.jsx`) {
          return path;
        }
      }
    }

    // 3. Fallback: basename del filename del payload (puede venir como URL).
    if (filename) {
      const base = filename.split(/[\\/]/).pop()?.split('?')[0] ?? '';
      if (base && (base.endsWith('.tsx') || base.endsWith('.ts') || base.endsWith('.jsx') || base.endsWith('.js'))) {
        for (const path of files.keys()) {
          if (path === base || path.endsWith('/' + base)) return path;
        }
      }
    }

    return null;
  }

  /**
   * Paths de proyecto (src/…) importados directamente por `content` vía
   * especificadores relativos (./ ../) o alias @/. Un solo nivel, sin recursión.
   * Ignora paquetes npm. Deduplicado, preservando el orden de aparición.
   */
  private static resolveDirectProjectImports(
    fromPath: string,
    content: string,
    files: Map<string, string>
  ): string[] {
    const dir = fromPath.slice(0, fromPath.lastIndexOf('/'));
    const importRe = /import\s+[^'"]*from\s+['"]([^'"]+)['"]/g;
    const out: string[] = [];
    const seen = new Set<string>();
    let m: RegExpExecArray | null;

    while ((m = importRe.exec(content)) !== null) {
      const spec = m[1];
      let base: string | null = null;

      if (spec.startsWith('@/')) {
        base = 'src/' + spec.slice(2);
      } else if (spec.startsWith('./') || spec.startsWith('../')) {
        const parts = dir.split('/');
        for (const seg of spec.split('/')) {
          if (seg === '' || seg === '.') continue;
          if (seg === '..') { parts.pop(); continue; }
          parts.push(seg);
        }
        base = parts.join('/');
      } else {
        continue; // paquete npm
      }
      if (!base) continue;

      for (const suffix of ['', '.tsx', '.ts', '/index.tsx', '.jsx', '.js']) {
        const cand = base + suffix;
        if (files.has(cand) && !seen.has(cand)) {
          seen.add(cand);
          out.push(cand);
          break;
        }
      }
    }
    return out;
  }

  /**
   * Ordena `paths` poniendo primero aquellos cuyo nombre de archivo aparece en
   * el texto del stack (candidatos más probables de estar implicados en el error).
   * Orden estable para el resto.
   */
  private static prioritizeByStack(paths: string[], stackText: string): string[] {
    const inStack = (p: string): boolean => {
      const base = (p.split('/').pop() ?? '').replace(/\.(tsx?|jsx?)$/, '');
      if (!base) return false;
      return new RegExp(`\\b${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(stackText);
    };
    return paths
      .map((p, i) => ({ p, i, hit: inStack(p) }))
      .sort((a, b) => (Number(b.hit) - Number(a.hit)) || (a.i - b.i))
      .map(x => x.p);
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
