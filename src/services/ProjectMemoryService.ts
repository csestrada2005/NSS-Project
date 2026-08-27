import { SupabaseService } from './SupabaseService';
import { isMigrationPath } from '../utils/migrationPath.js';

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
      // UN SOLO RECONOCEDOR. Esta condición era una COPIA literal de
      // isMigrationPath: mismo prefijo, misma extensión, escrita a mano aquí.
      // Dos copias de un predicado son dos predicados en cuanto una cambia, y
      // ésta es la que decide qué schema ve el modelo: si migrationPath.js
      // ensancha lo que cuenta como migración (mayúsculas en `.SQL`, otro
      // prefijo) y esta copia no se entera, el modelo escribe contra un mundo
      // que ya no existe — el mismo silencio que la Cirugía 2.2 vino a matar,
      // por la única vía que quedaba abierta. El reconocedor vive en
      // migrationPath.js; aquí sólo se consume.
      if (isMigrationPath(path) || path === 'src/types.ts') {
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
      .maybeSingle();

    if (error || !data) return null;

    const memory = data as ProjectMemory;
    memoryCache.set(projectId, { memory, expires: Date.now() + CACHE_TTL_MS });
    return memory;
  }

  static async getProjectSummary(projectId: string): Promise<{
    componentCount: number;
    routeCount: number;
    lastUpdated: string;
    techStack: string[];
  } | null> {
    try {
      const cached = memoryCache.get(projectId);
      if (cached && Date.now() < cached.expires) {
        return {
          componentCount: cached.memory.component_registry.length,
          routeCount: cached.memory.route_map.length,
          lastUpdated: cached.memory.updated_at,
          techStack: Object.keys(cached.memory.tech_stack),
        };
      }

      const supabase = SupabaseService.getInstance().client;
      const { data, error } = await supabase
        .from('forge_project_memory')
        .select('component_registry, route_map, tech_stack, updated_at')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error || !data) return null;

      const techStackObj = data.tech_stack as Record<string, string>;
      const componentRegistry = data.component_registry as ComponentEntry[];
      const routeMap = data.route_map as RouteEntry[];

      return {
        componentCount: Array.isArray(componentRegistry) ? componentRegistry.length : 0,
        routeCount: Array.isArray(routeMap) ? routeMap.length : 0,
        lastUpdated: data.updated_at as string,
        techStack: techStackObj ? Object.keys(techStackObj) : [],
      };
    } catch (e) {
      console.error('[ProjectMemoryService] getProjectSummary error:', e);
      return null;
    }
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
    // Ya no se lee: cuando todo campo se recomputa entero desde `allFiles`, la
    // lista de paths tocados deja de decidir nada. Se conserva en la firma —con
    // prefijo `_` para noUnusedParameters— porque es la ANOTACIÓN DE INTENCIÓN
    // del caller: qué escribió este intent. Los cuatro call sites la pasan, el
    // log de intents la contrasta, y quitarla obligaría a reescribirlos sin
    // ganar nada. Si algún día vuelve a hacer falta (telemetría, invalidación
    // selectiva), está donde tiene que estar.
    _modifiedFilePaths: string[],
    allFiles: Map<string, string>
  ): Promise<void> {
    const existing = await this.get(projectId);
    if (!existing) return;

    // UN SOLO INDEXADOR. Aquí vivía un reindexado incremental (filtrar los
    // paths modificados y recorrerlos con una regex escrita a mano) cuya regex
    // era COPIA LITERAL de la de extractComponents: la línea 93 y la 296 eran
    // el mismo predicado escrito dos veces. Dos copias son dos predicados en
    // cuanto una cambia, y ésta decide qué componentes ve el modelo: ampliar
    // extractComponents (otro prefijo, otra forma de export) sin enterarse
    // aquí devolvía un registro parcial. Se unifica al extractor canónico,
    // exactamente como isMigrationPath en C-F. allFiles es el mapa COMPLETO
    // del proyecto en los cuatro call sites, así que recomputar entero da el
    // mismo resultado que el incremental —sin la copia.
    existing.component_registry = this.extractComponents(allFiles);

    // Misma doctrina para la foto del proyecto: tech_stack, design_tokens,
    // route_map y code_conventions son proyecciones puras de los archivos, no
    // estado acumulado. Se recomputan ENTERAS en cada cambio para que la
    // memoria no quede congelada en el estado del build inicial: una ruta
    // nueva en App.tsx, un token cambiado en index.css, una dependencia
    // añadida a package.json o un alias movido en tsconfig entraban antes en
    // el proyecto sin entrar jamás en la memoria, y el modelo seguía leyendo
    // la foto del primer día.
    existing.tech_stack = this.extractTechStack(allFiles);
    existing.design_tokens = this.extractDesignTokens(allFiles);
    existing.route_map = this.extractRoutes(allFiles);
    existing.code_conventions = this.extractConventions(allFiles);

    // El schema se recalcula ENTERO desde allFiles, igual que en buildFromFiles.
    // Doctrina: database_schema es la intención acumulada en los archivos del
    // proyecto (migraciones + src/types.ts), no una introspección de la base
    // viva. Sin esta línea, una migración escrita después del primer build
    // jamás entraba en la memoria y el contexto de schema quedaba congelado en
    // el estado del bootstrap. El contrapeso de realidad son las marcas
    // [DDL_OUTCOME:]: la divergencia archivo/base es una propiedad conocida.
    existing.database_schema = this.extractDatabaseSchema(allFiles);

    await this.save(projectId, existing);
  }

  static formatForPrompt(memory: ProjectMemory, maxChars: number = 6000): string {
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

    // Calculate how much we have so far
    let currentLength = lines.join('\n').length;

    // Optional parts below - truncate from bottom if over maxChars
    const optionalParts: string[] = [];

    // Routes
    if (memory.route_map.length > 0) {
      const routeLines = ['ROUTES:'];
      for (const r of memory.route_map) {
        routeLines.push(`  ${r.path} → <${r.component}>`);
      }
      optionalParts.push(routeLines.join('\n'));
    }

    // Design tokens (top 10)
    const tokenEntries = Object.entries(memory.design_tokens).slice(0, 10);
    if (tokenEntries.length > 0) {
      const tokenLines = ['DESIGN TOKENS:'];
      for (const [k, v] of tokenEntries) {
        tokenLines.push(`  ${k}: ${v}`);
      }
      optionalParts.push(tokenLines.join('\n'));
    }

    // DB schema (truncated)
    if (memory.database_schema) {
      const dbLines = ['DB SCHEMA (excerpt):'];
      dbLines.push(memory.database_schema.slice(0, 400));
      optionalParts.push(dbLines.join('\n'));
    }

    // Last 3 actions
    if (memory.last_10_actions.length > 0) {
      const actionLines = ['RECENT ACTIONS:'];
      for (const a of memory.last_10_actions.slice(0, 3)) {
        actionLines.push(`  [${a.outcome}] ${a.action}`);
      }
      optionalParts.push(actionLines.join('\n'));
    }

    for (const part of optionalParts) {
      if (currentLength + part.length + 100 > maxChars) {
        break; // Stop adding parts if we would exceed limits
      }
      lines.push(part);
      currentLength += part.length + 1;
    }

    lines.push('=== END MEMORY ===');

    return lines.join('\n').slice(0, maxChars);
  }

  // -------------------------------------------------------------------------
  // Private save helper
  // -------------------------------------------------------------------------

  private static async save(projectId: string, memory: ProjectMemory): Promise<void> {
    const supabase = SupabaseService.getInstance().client;

    // ensure no separate id field in payload
    const { ...memoryData } = memory;
    if ('id' in memoryData) {
      delete (memoryData as any).id;
    }

    const payload = { ...memoryData, updated_at: new Date().toISOString() };

    await supabase
      .from('forge_project_memory')
      .upsert(payload, { onConflict: 'project_id' });
    memoryCache.set(projectId, { memory, expires: Date.now() + CACHE_TTL_MS });
  }
}
