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
    isInitialBuild: boolean = false,
    signal?: AbortSignal
  ): Promise<{ steps: BuildStep[]; wasTrimmed: boolean; originalCount: number }> {
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

ROUTING & ENTRY-POINT RULES — critical:
- The route "/" renders src/pages/Index.tsx. This is the page the user sees first.
- When the user asks to change "the page", "home page", "landing page", "main page", "página principal", "inicio", or the main screen WITHOUT naming a new route, you MUST include a step with action "modify" on src/pages/Index.tsx. A new standalone component is NOT enough — a component that nothing renders never appears in the preview.
- If any step has action "create" for a component, you MUST also include a step with action "modify" on the file that renders it (usually src/pages/Index.tsx, or src/App.tsx for routing) that imports and uses that component. That modify step must list the create step in its requires_steps. Never leave a created component unreferenced.
- Only modify src/App.tsx routing when the user explicitly asks for a new page/route.
- PAGE IMPORT CONTRACT: any step that updates src/App.tsx routing imports page components as DEFAULT imports — its description MUST state it verbatim, e.g. "App.tsx routes /about to the About page, imported as a default import: import About from './pages/About'". Never plan a router step that uses a named import for a file under src/pages/. The counterpart rule makes every src/pages/ file end with "export default <PageName>;", so the default import is always the one that resolves.

Return ONLY a valid JSON array. No markdown fences, no explanation before or after.${initialBuildRule}`;

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
        return { steps: [], wasTrimmed: false, originalCount: 0 };
      }

      const text: string = data.content?.[0]?.text ?? '';
      const cleaned = this.extractJsonArray(text);
      let steps = JSON.parse(this.sanitizeJson(cleaned)) as BuildStep[];

      if (!Array.isArray(steps)) return { steps: [], wasTrimmed: false, originalCount: 0 };

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

      return { steps: filteredAndMappedSteps, wasTrimmed, originalCount };
    } catch (e) {
      console.error('[Architect] Failed to plan:', e);
      return { steps: [], wasTrimmed: false, originalCount: 0 };
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
