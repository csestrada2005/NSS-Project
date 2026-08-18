import { platformService } from './PlatformService';
import { cachedSystemBlocks, prefixHash } from './promptCache';
import { buildProjectContextPrefix, buildBlueprintBlock } from './promptRules';
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
    designContext?: string,
    blueprint: string = '',
    // Grafo "importado por" calculado deterministamente por el orquestador (ver
    // src/utils/importGraph.js). Es la evidencia del ORPHAN TEST: sin él, el
    // plan sólo ve una lista de paths y decide qué es código muerto por
    // semántica del nombre. Opcional para no romper llamadas existentes.
    importedByBlock: string = '',
    isInitialBuild: boolean = false,
    signal?: AbortSignal
  ): Promise<{
    steps: BuildStep[];
    wasTrimmed: boolean;
    originalCount: number;
    /**
     * Paths the USER'S REQUEST named for removal — la referencia EXTERNA al
     * plan que autoriza sus deletes. El guard determinista la expande con las
     * huérfanas exclusivas pre-plan y la contrasta contra originalFiles; sin
     * ella un plan sólo puede borrar lo que ya estaba huérfano ANTES de correr.
     */
    deletionTargets: string[];
  }> {
    console.log('[Architect] designContext chars:', designContext?.length ?? 0, '| preview:', designContext?.slice(0, 300)); // TODO: remove after RAG verification
    // Initial build of a brand-new project: the scaffold left the layout chrome
    // in its template state ("App Name" navbar, single "Home" link, "Your
    // Company" footer). The plan MUST claim a step to brand it. This does NOT
    // apply to later edits — by then the chrome is already customized.
    const initialBuildRule = isInitialBuild
      ? `

INITIAL-BUILD LAYOUT RULE — MANDATORY (this is the first build of a new project):
- The project was scaffolded from a template whose src/components/layout/Header.tsx and src/components/layout/Footer.tsx still contain placeholder chrome (brand shows "App Name", a single "Home" nav link, footer says "Your Company"). Leaving them untouched ships a generic navbar.
- Your plan MUST include a step with action "modify" on src/components/layout/Header.tsx that makes the navbar reflect: (1) the brand name from the design brief, (2) nav links whose anchors/routes point ONLY to sections this same plan creates (respect the navigation contract), and (3) the primary CTA. This step is REQUIRED, not optional.
- Your plan MUST ALSO include a SEPARATE step with action "modify" on src/components/layout/Footer.tsx that reflects: (1) the brand name and tagline from siteInfo (src/data/site.ts), (2) the SAME anchors/links as this plan's navigation contract (the footer nav must resolve to sections this plan creates, exactly like the header), and (3) the contact data (address, phone, email, business hours) consumed from siteInfo — NEVER as literals. This step is REQUIRED, not optional.
- Do NOT fold Header or Footer changes into another step's description — layout components get their own steps with their own file_path; a mention inside another step's description does not write the file.
- The Header and Footer steps are ALWAYS required in initial builds and must never be consolidated away: plan your section steps so the total (sections + Index + Header + Footer) fits within the 8-step maximum.`
      : '';
    const systemPrompt = `You are a software architect for a React + TypeScript + Tailwind web builder.
Do not write any code. Return only a JSON array of BuildStep objects.
Each BuildStep must have exactly these fields:

order: number (starting at 1)
description: string (what the file will DO after the change, not what action you take. Bad: "Update Dashboard.tsx". Good: "Dashboard showing monthly revenue chart and active projects KPI cards")
file_path: string (exact path e.g. "src/components/Foo.tsx")
action: "create" | "modify" | "delete"
requires_steps: number[] (empty array if no dependencies)

PLANNING RULES — follow these exactly:

Maximum 8 steps for any request. If you think you need more, consolidate SECTIONS — never the Header/Footer layout steps.
Minimum 1 step. Never return an empty array.
One step = one file. Never put two different file paths in one step.
Each visual section of a page gets its OWN component file in src/components/sections/ (HeroSection.tsx, PricingSection.tsx, ContactSection.tsx...). NEVER bundle multiple sections into a single file (no 'LandingSections', 'MainSections', or similar catch-all files). One section = one file = one plan step. A section component should stay under ~200 lines; if it grows beyond that, split subcomponents into the same folder.
Purely cosmetic changes (color, text, spacing): return exactly 1 step.
New page: 2-4 steps maximum (page component + sub-components + router update).
Do not create test files, story files, or documentation files unless explicitly asked.
Do not modify package.json, vite.config.ts, tsconfig.json, or any config file unless the user explicitly asks to add a dependency or change build configuration.
If the user asks to fix something, only modify files that contain the bug.
Every step description must explain what the file will contain after the change.
All description strings must be plain text only — no newlines, no backticks, no special characters.
Plans must never create a step that adds Header/Footer rendering to a page component. Chrome changes belong to Layout.tsx or the chrome components themselves.
When a step is a contact, footer, or about section (or any section that shows the address, phone, email, business hours, brand name or tagline), its description MUST explicitly state that it consumes siteInfo from src/data/site.ts. Never plan a step that hardcodes contact data — there is one single source for those facts.

DOMAIN DATA RULE — a data file is a step, not a detail:
- When a page or a section needs 3 or more items of domain data (products, menu items, testimonials, features, FAQ entries, team members, pricing plans, gallery entries, stats), the plan MUST include a step whose file_path is src/data/<domain>.ts (action "create", or "modify" when that file already exists) declaring the TYPED array — e.g. src/data/products.ts exporting a Product type and the array of 12 products.
- That data step comes BEFORE the step of the section that consumes it, and the consuming step MUST list it in requires_steps. The section's description MUST state that it imports the array from src/data/<domain>.ts and renders it by mapping over it. Never write a section description that has the section declaring its own items.
- One domain = one data file = one step (src/data/products.ts, src/data/testimonials.ts). Never bundle two domains into one data file, and never fold the data back into the section file.
- Data steps count against the 8-step maximum — budget them when you plan. If the plan does not fit, consolidate or drop SECTIONS; never drop a data step whose section survives, because that leaves the section importing a file no step writes.
- Arrays of purely visual configuration (style variants, className maps, icon-to-color lookups) are NOT domain data: they stay inside the component and get no step of their own.
- SIZE SPLIT: a section that would project past ~200 lines because of the VOLUME of its content is the signal to split it in two steps — src/data/<domain>.ts for the data, the section for the presentation that maps over it. Splitting data out is the first cut to make, before splitting subcomponents.
- src/data/site.ts stays what it is: the single source for contact and brand facts. Domain collections get their own file next to it, never appended to site.ts.

ROUTING & ENTRY-POINT RULES — critical:
- The route "/" renders src/pages/Index.tsx. This is the page the user sees first.
- When the user asks to change "the page", "home page", "landing page", "main page", "página principal", "inicio", or the main screen WITHOUT naming a new route, you MUST include a step with action "modify" on src/pages/Index.tsx. A new standalone component is NOT enough — a component that nothing renders never appears in the preview.
- If any step has action "create" for a component, you MUST also include a step with action "modify" on the file that renders it (usually src/pages/Index.tsx, or src/App.tsx for routing) that imports and uses that component. That modify step must list the create step in its requires_steps. Never leave a created component unreferenced.
- Only modify src/App.tsx routing when the user explicitly asks for a new page/route.
- PAGE IMPORT CONTRACT: any step that updates src/App.tsx routing imports page components as DEFAULT imports — its description MUST state it verbatim, e.g. "App.tsx routes /about to the About page, imported as a default import: import About from './pages/About'". Never plan a router step that uses a named import for a file under src/pages/. The counterpart rule makes every src/pages/ file end with "export default <PageName>;", so the default import is always the one that resolves.

DELETION RULES — a removal intent must actually remove the files:
- When the user asks to remove, delete, or drop a page or a section ("elimina la página Sobre Nosotros", "quita la sección de precios", "borra el blog"), unwiring it is only HALF the job. A plan that merely edits src/App.tsx and the Header leaves the page file and its section components on disk as dead code. That plan is WRONG.
- Such a plan MUST include, in addition to the "modify" steps that unwire it: (1) a step with action "delete" on the page file itself (e.g. src/pages/About.tsx), and (2) one step with action "delete" for EVERY section component that only that page used (e.g. src/components/sections/AboutHeroSection.tsx, CompanyHistorySection.tsx, TeamSection.tsx). One file = one delete step, exactly like creates.
- ORPHAN TEST — the ONLY definition of "dead code" you may act on. A file may carry action "delete" ONLY IF NO SURVIVING FILE IMPORTS IT. A surviving file is any file of the project that this same plan does not also delete. Read the answer off the IMPORT GRAPH block in the user message: the candidate is deletable only when its "imported by" list is "(nobody)", or when every importer listed is itself a delete step of THIS plan. If a single importer survives, the file is ALIVE — do not delete it, leave it untouched.
- A NAME IS NOT EVIDENCE OF PARENTHOOD. Sharing a word with the thing being removed proves nothing: src/components/sections/MenuSection.tsx is the menu SECTION of the landing page (imported by src/pages/Index.tsx) and has nothing to do with src/pages/Menu.tsx beyond the word "Menu". Deleting it because the plan removes the Menu page erases a section of the home page. The same applies to About/AboutSection, Contact/ContactSection, Services/ServicesSection and every similar pair.
- NEVER write a description like "used exclusively by the X page" unless the IMPORT GRAPH literally shows that page as the file's only importer. If the graph contradicts your intuition, the graph wins.
- If a candidate does not appear in the IMPORT GRAPH block (or no such block was provided), you CANNOT verify it: do NOT delete it. Keeping an unused component is a harmless leftover; deleting a used one breaks the pages that render it.
- ORDERING: every "delete" step must list in its requires_steps the "modify" steps that stop referencing the file (the router step, the Header/Footer nav step, the page that rendered the section). A file must never be deleted while something still imports it.
- NEVER emit action "delete" on infrastructure. These files are removed FROM, never removed: src/App.tsx, src/main.tsx, src/index.css, src/pages/Index.tsx, src/data/site.ts, anything under src/lib/, src/components/ui/ or src/components/layout/ (Layout.tsx, Header.tsx, Footer.tsx), and any config file (package.json, vite.config.ts, tailwind.config.ts, index.html, tsconfig*.json). To remove a link or a route you MODIFY these files; deleting one destroys the project.
- Deletes belong to removal intents only. A redesign, a rename, a content rewrite or a "replace X with Y" request is a "modify" — never plan a delete because a file is about to change.

DELETION TARGETS — the field that AUTHORIZES a delete:
- Alongside the steps you must report deletion_targets: the paths THE USER'S REQUEST NAMES for removal. Nothing else goes in this list.
- A path belongs in deletion_targets only if the user's own words point at that file: "elimina la página Menú" names src/pages/Menu.tsx. It does NOT name src/components/sections/MenuSection.tsx — sharing the word "Menu" is not being named, it is a coincidence of vocabulary. If the IMPORT GRAPH shows a surviving file importing the candidate, the user did not name it: leave it out.
- Do NOT list the components the target uses internally: files imported ONLY by the targets are expanded deterministically downstream, from the import graph, without your help. List the thing the user asked to remove, not its contents.
- deletion_targets is NOT the list of your delete steps and NOT the list of files you are modifying. It is the answer to one question: which files did the user ask to remove? For a request with no removal in it, deletion_targets is [].
- A delete step over a path that is neither in deletion_targets nor orphaned BEFORE this plan runs is refused downstream, whatever your steps do to unwire it first. Unwiring a file in an earlier step does not make it deletable: the check reads the project as it was before your plan.

OUTPUT FORMAT — return ONLY a valid JSON object with exactly these two keys, no markdown fences, no explanation before or after:
{"deletion_targets": ["src/pages/Menu.tsx"], "steps": [ ...the BuildStep objects... ]}${initialBuildRule}`;

    try {
      // CAMBIO 1 — el design brief y el blueprint viajan en el prefijo estático
      // cacheado (compartido byte-a-byte con Implementer y Verifier en esta
      // generación), no en el user message. El user message queda con lo que
      // varía por petición: memoria, request e intent. El Architect corre PRIMERO
      // en la generación, así que ESCRIBE la caché del prefijo que luego leen los
      // steps del Implementer y las reparaciones Sonnet del Verifier.
      const stablePrefix = buildProjectContextPrefix(designContext);
      // Architect is the FIRST Sonnet of the intent, so it WRITES the shared
      // cross-intent prefix cache the other lanes read. Log its fingerprint per
      // intent: same hash + cache_read=0 on the next intent ⇒ TTL expiry, not a
      // bug; different hash ⇒ the prefix mutated and the diff shows what.
      console.log(`[cache] prefix hash=${prefixHash(stablePrefix)}`);
      const blueprintBlock = buildBlueprintBlock(blueprint);
      // El grafo viaja en el user message, no en los bloques cacheados: cambia
      // con cada intent (igual que el blueprint) y el Architect corre UNA vez
      // por generación, así que cachearlo no ahorraría nada y sí ensuciaría el
      // prefijo estable que comparten Implementer y Verifier.
      const importGraphSection = importedByBlock.trim().length > 0
        ? `${importedByBlock.trim()}\n\n`
        : '';
      const userMessage =
        `${memoryFormatted}\n\n` +
        importGraphSection +
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
        // system = [ stablePrefix (reglas + brief, cacheado y estable ENTRE
        // intents), blueprintBlock (mutable, cacheado sólo dentro del intent),
        // reglas de planificación del Architect (cacheado por-lane) ]. La
        // initial-build rule es estática dentro de la generación, así que va en
        // el bloque de rol sin romper el prefijo compartido.
        system: cachedSystemBlocks(stablePrefix, blueprintBlock, systemPrompt),
        messages: [{ role: 'user', content: userMessage }],
      }, signal);

      const data = await response.json();

      if (data.error) {
        console.error('[Architect] API error:', data.error);
        return { steps: [], wasTrimmed: false, originalCount: 0, deletionTargets: [] };
      }

      const text: string = data.content?.[0]?.text ?? '';
      // El plan viaja ahora como objeto {deletion_targets, steps}. El array
      // pelado se sigue aceptando: es lo que devuelven los modelos que ignoran
      // el nuevo contrato, y un plan sin targets no es un plan inválido — sólo
      // uno que únicamente podrá borrar lo que ya estaba huérfano.
      const { steps: rawSteps, deletionTargets } = this.extractPlanPayload(text);
      let steps = rawSteps;

      if (!Array.isArray(steps)) return { steps: [], wasTrimmed: false, originalCount: 0, deletionTargets: [] };

      const originalCount = steps.length;
      let wasTrimmed = false;
      if (steps.length > 8) {
        // Protect the layout chrome: never trim Header.tsx or Footer.tsx steps.
        // Cut sections before layout — drop non-layout steps first, keeping the
        // layout steps even if that means keeping fewer sections.
        const isLayoutStep = (s: BuildStep) => {
          const p = (s.file_path ?? '').replace(/\\/g, '/');
          return p.endsWith('layout/Header.tsx') || p.endsWith('layout/Footer.tsx');
        };
        const layoutSteps = steps.filter(isLayoutStep);
        const nonLayoutSteps = steps.filter(s => !isLayoutStep(s));
        const roomForNonLayout = Math.max(0, 8 - layoutSteps.length);
        const kept = [...nonLayoutSteps.slice(0, roomForNonLayout), ...layoutSteps];
        // Preserve original ordering.
        steps = steps.filter(s => kept.includes(s));
        wasTrimmed = true;
        console.warn(`[Architect] Plan trimmed from ${originalCount} to ${steps.length} steps (layout steps protected)`);
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

      return { steps: filteredAndMappedSteps, wasTrimmed, originalCount, deletionTargets };
    } catch (e) {
      console.error('[Architect] Failed to plan:', e);
      return { steps: [], wasTrimmed: false, originalCount: 0, deletionTargets: [] };
    }
  }

  /** Bloque JSON crudo del texto del modelo, con o sin fences. */
  private static extractJsonBlock(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = (fenced ? fenced[1] : text).trim();
    // El objeto manda: un plan con targets es {"deletion_targets": [...],
    // "steps": [...]} y su array interno no debe confundirse con el payload.
    const objStart = body.indexOf('{');
    const arrStart = body.indexOf('[');
    if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
      const objEnd = body.lastIndexOf('}');
      if (objEnd > objStart) return body.slice(objStart, objEnd + 1);
    }
    if (arrStart !== -1) {
      const arrEnd = body.lastIndexOf(']');
      if (arrEnd > arrStart) return body.slice(arrStart, arrEnd + 1);
    }
    return body;
  }

  /**
   * Steps + deletion_targets del texto del modelo. Acepta las dos formas: el
   * objeto {deletion_targets, steps} del contrato actual y el array pelado de
   * BuildSteps (contrato anterior). Sin targets la lista queda vacía, que es el
   * lado seguro: el guard sólo dejará pasar deletes ya huérfanos pre-plan.
   */
  private static extractPlanPayload(
    text: string
  ): { steps: BuildStep[]; deletionTargets: string[] } {
    const parsed = JSON.parse(this.sanitizeJson(this.extractJsonBlock(text)));

    if (Array.isArray(parsed)) {
      return { steps: parsed as BuildStep[], deletionTargets: [] };
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as { steps?: unknown; deletion_targets?: unknown };
      const steps = Array.isArray(obj.steps) ? (obj.steps as BuildStep[]) : [];
      const targets = Array.isArray(obj.deletion_targets)
        ? obj.deletion_targets
            .filter((t): t is string => typeof t === 'string')
            .map(t => t.trim())
            .filter(t => t.length > 0)
        : [];
      return { steps, deletionTargets: [...new Set(targets)] };
    }
    return { steps: [], deletionTargets: [] };
  }
}
