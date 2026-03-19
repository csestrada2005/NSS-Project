import { SupabaseService } from './SupabaseService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComponentEntry {
  name: string;
  path: string;
}

export interface RouteEntry {
  path: string;
  component: string;
}

export interface CodeConventions {
  uses_tailwind: boolean;
  uses_cn: boolean;
  import_alias: string | null;
}

export interface ActionRecord {
  action: string;
  outcome: string;
  timestamp: string;
}

export interface ProjectMemory {
  project_id: string;
  tech_stack: Record<string, string>;
  design_tokens: Record<string, string>;
  component_registry: ComponentEntry[];
  route_map: RouteEntry[];
  database_schema: string;
  code_conventions: CodeConventions;
  last_10_actions: ActionRecord[];
  updated_at: string;
}

// ---------------------------------------------------------------------------
// In-memory cache — 30-second TTL
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, { memory: ProjectMemory; expires: number }>();
const CACHE_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// ProjectMemoryService
// ---------------------------------------------------------------------------

export class ProjectMemoryService {
  // -------------------------------------------------------------------------
  // Private extraction helpers
  // -------------------------------------------------------------------------

  private static extractTechStack(files: Map<string, string>): Record<string, string> {
    const pkg = files.get('package.json');
    if (!pkg) return {};
    try {
      const parsed = JSON.parse(pkg) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      return { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
    } catch {
      return {};
    }
  }

  private static extractDesignTokens(files: Map<string, string>): Record<string, string> {
    const css = files.get('src/index.css');
    if (!css) return {};
    const tokens: Record<string, string> = {};
    const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = varRegex.exec(css)) !== null) {
      tokens[`--${m[1]}`] = m[2].trim();
    }
    return tokens;
  }

  private static extractComponents(files: Map<string, string>): ComponentEntry[] {
    const entries: ComponentEntry[] = [];
    for (const [path, content] of files) {
      if (
        !path.startsWith('src/components') &&
        !path.startsWith('src/pages')
      ) continue;
      if (!path.endsWith('.tsx')) continue;
      // Match: export function Foo, export const Foo, export default function Foo
      const exportRegex = /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/g;
      let m: RegExpExecArray | null;
      while ((m = exportRegex.exec(content)) !== null) {
        entries.push({ name: m[1], path });
      }
    }
    return entries;
  }

  private static extractRoutes(files: Map<string, string>): RouteEntry[] {
    const app = files.get('src/App.tsx');
    if (!app) return [];
    const routes: RouteEntry[] = [];
    // Match <Route path="..." element={<Component
    const routeRegex = /<Route[^>]+path=["']([^"']+)["'][^>]*element=\{[^}]*?<([A-Z][A-Za-z0-9_]*)/g;
    let m: RegExpExecArray | null;
    while ((m = routeRegex.exec(app)) !== null) {
      routes.push({ path: m[1], component: m[2] });
    }
    return routes;
  }

  private static extractDatabaseSchema(files: Map<string, string>): string {
    const parts: string[] = [];
    for (const [path, content] of files) {
      if (
        (path.startsWith('supabase/migrations/') && path.endsWith('.sql')) ||
        path === 'src/types.ts'
      ) {
        parts.push(`-- ${path}\n${content.slice(0, 1000)}`);
      }
    }
    return parts.join('\n\n').slice(0, 3000);
  }

  private static extractConventions(files: Map<string, string>): CodeConventions {
    let uses_tailwind = false;
    let uses_cn = false;
    let import_alias: string | null = null;

    if (
      files.has('tailwind.config.ts') ||
      files.has('tailwind.config.js') ||
      files.has('tailwindcss.config.ts')
    ) {
      uses_tailwind = true;
    }

    for (const [path, content] of files) {
      if (!path.endsWith('.tsx') && !path.endsWith('.ts')) continue;
      if (content.includes('cn(')) {
        uses_cn = true;
      }
      if (uses_cn && uses_tailwind) break;
    }

    const tsconfig = files.get('tsconfig.json') || files.get('tsconfig.app.json');
    if (tsconfig) {
      try {
        const parsed = JSON.parse(tsconfig) as {
          compilerOptions?: { paths?: Record<string, string[]> };
        };
        const paths = parsed.compilerOptions?.paths ?? {};
        const keys = Object.keys(paths);
        if (keys.length > 0) {
          import_alias = keys[0].replace('/*', '');
        }
      } catch {
        // ignore
      }
    }

    return { uses_tailwind, uses_cn, import_alias };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  static async get(projectId: string): Promise<ProjectMemory | null> {
    const cached = memoryCache.get(projectId);
    if (cached && Date.now() < cached.expires) {
      return cached.memory;
    }

    const supabase = SupabaseService.getInstance().client;
    const { data, error } = await supabase
      .from('forge_project_memory')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (error || !data) return null;

    const memory = data as ProjectMemory;
    memoryCache.set(projectId, { memory, expires: Date.now() + CACHE_TTL_MS });
    return memory;
  }

  static async buildFromFiles(
    projectId: string,
    files: Map<string, string>
  ): Promise<ProjectMemory> {
    const memory: ProjectMemory = {
      project_id: projectId,
      tech_stack: this.extractTechStack(files),
      design_tokens: this.extractDesignTokens(files),
      component_registry: this.extractComponents(files),
      route_map: this.extractRoutes(files),
      database_schema: this.extractDatabaseSchema(files),
      code_conventions: this.extractConventions(files),
      last_10_actions: [],
      updated_at: new Date().toISOString(),
    };

    await this.save(projectId, memory);
    return memory;
  }

  static async recordAction(
    projectId: string,
    action: { action: string; outcome: string }
  ): Promise<void> {
    const existing = await this.get(projectId);
    if (!existing) return;

    const newRecord: ActionRecord = {
      ...action,
      timestamp: new Date().toISOString(),
    };

    existing.last_10_actions = [newRecord, ...existing.last_10_actions].slice(0, 10);
    await this.save(projectId, existing);
  }

  static async updateAfterChange(
    projectId: string,
    modifiedFilePaths: string[],
    allFiles: Map<string, string>
  ): Promise<void> {
    const existing = await this.get(projectId);
    if (!existing) return;

    // Remove entries for modified files, then re-index them
    const updatedRegistry = existing.component_registry.filter(
      e => !modifiedFilePaths.includes(e.path)
    );

    for (const path of modifiedFilePaths) {
      if (
        (!path.startsWith('src/components') && !path.startsWith('src/pages')) ||
        !path.endsWith('.tsx')
      ) continue;

      const content = allFiles.get(path) ?? '';
      const exportRegex = /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/g;
      let m: RegExpExecArray | null;
      while ((m = exportRegex.exec(content)) !== null) {
        updatedRegistry.push({ name: m[1], path });
      }
    }

    existing.component_registry = updatedRegistry;
    await this.save(projectId, existing);
  }

  static formatForPrompt(memory: ProjectMemory): string {
    const lines: string[] = ['=== PROJECT MEMORY ==='];

    // Tech stack (names only, no versions)
    const topDeps = Object.keys(memory.tech_stack).slice(0, 20).join(', ');
    lines.push(`TECH STACK: ${topDeps}`);

    // Conventions
    const conv = memory.code_conventions;
    lines.push(
      `CONVENTIONS: tailwind=${conv.uses_tailwind}, cn()=${conv.uses_cn}, alias=${conv.import_alias ?? 'none'}`
    );

    // Component registry (up to 30)
    if (memory.component_registry.length > 0) {
      lines.push('COMPONENTS:');
      for (const c of memory.component_registry.slice(0, 30)) {
        lines.push(`  ${c.name} → ${c.path}`);
      }
    }

    // Routes
    if (memory.route_map.length > 0) {
      lines.push('ROUTES:');
      for (const r of memory.route_map) {
        lines.push(`  ${r.path} → <${r.component}>`);
      }
    }

    // Design tokens (top 10)
    const tokenEntries = Object.entries(memory.design_tokens).slice(0, 10);
    if (tokenEntries.length > 0) {
      lines.push('DESIGN TOKENS:');
      for (const [k, v] of tokenEntries) {
        lines.push(`  ${k}: ${v}`);
      }
    }

    // DB schema (truncated)
    if (memory.database_schema) {
      lines.push('DB SCHEMA (excerpt):');
      lines.push(memory.database_schema.slice(0, 400));
    }

    // Last 3 actions
    if (memory.last_10_actions.length > 0) {
      lines.push('RECENT ACTIONS:');
      for (const a of memory.last_10_actions.slice(0, 3)) {
        lines.push(`  [${a.outcome}] ${a.action}`);
      }
    }

    lines.push('=== END MEMORY ===');

    // ~4 chars per token, target 2000 tokens = 8000 chars
    return lines.join('\n').slice(0, 8000);
  }

  // -------------------------------------------------------------------------
  // Private save helper
  // -------------------------------------------------------------------------

  private static async save(projectId: string, memory: ProjectMemory): Promise<void> {
    const supabase = SupabaseService.getInstance().client;
    const payload = { ...memory, updated_at: new Date().toISOString() };
    await supabase
      .from('forge_project_memory')
      .upsert(payload, { onConflict: 'project_id' });
    memoryCache.set(projectId, { memory, expires: Date.now() + CACHE_TTL_MS });
  }
}
