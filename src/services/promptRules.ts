/**
 * Shared prompt rules for every code-generation lane.
 *
 * REACT_TAILWIND_RULES used to live duplicated inside AIOrchestrator and
 * Implementer, which let the two paths drift apart. It now lives here as the
 * single source of truth so the plan lane, the simple lane, the legacy heavy
 * lane and the per-step Implementer all share one contract — including the
 * anti-template / brand rules at the bottom.
 */

export const REACT_TAILWIND_RULES = `
REACT/TAILWIND RULES:
- Always write complete file contents, never partial updates
- Prefer Tailwind utility classes; avoid inline styles unless position math requires it
- Follow existing file structure and import patterns visible in context
- Supabase: import { supabase } from '@/lib/supabase'. NEVER import
  SupabaseService, and NEVER call createClient yourself — the client is
  already provided by the template.
- \`supabase\` may be null when the project has no database provisioned.
  ALWAYS guard: if (!supabase) return null (or render an empty state).
  Never assume it exists.
- NEVER use supabase.auth — the preview runs in a sandboxed iframe with
  no localStorage, so end-user login is not supported. Data reads and
  writes work; sessions do not.
- Row Level Security is enforced automatically on every table. A table is
  PRIVATE by default. To make a table publicly readable, the migration
  MUST include, right after the CREATE TABLE:
  comment on table public.<name> is 'wyrd:read=public';
  Without that comment the table is invisible to the site.
- The global CSS entry file is ALWAYS src/index.css. Never import globals.css, global.css, or any other CSS filename. Never create a new CSS entry file.
- Fonts are already loaded via <link> in index.html. NEVER import fonts — no @import in CSS, no URL imports in JS/TS.
- Export convention: every component file uses a named export matching the filename (export function ServicesSection...). Importers use the matching named import. Never mix default and named exports for components.
- EXCEPTION — src/pages/: a page file MUST ALSO end with a default export of the page component (export default About;) on top of its named export, and every importer of a src/pages/ file (the App.tsx router in particular) uses the DEFAULT import: import About from './pages/About'. Pages are the only files where both exports coexist.
- For conditional or merged classNames, import cn from '@/lib/utils' (already provided; it wraps clsx + tailwind-merge). Never import clsx or tailwind-merge directly.
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

TEMPLATE PRIMITIVES (compose these — do not reinvent them):
- The template ships motion primitives in src/components/motion (FadeIn,
  StaggerChildren, ParallaxImage, Marquee, AnimatedCounter) and UI components in
  src/components/ui (button, card, input, textarea, label, badge, accordion,
  dialog, tabs, separator). PREFER composing these over hand-writing animations
  or basic UI. Import them; do not recreate them.
- Entrance/scroll reveals: wrap content in <FadeIn> (direction + delay props) and
  group sequential reveals with <StaggerChildren> — do NOT hand-roll
  IntersectionObserver or raw framer-motion variants for standard reveals.
- Stats/counters use <AnimatedCounter value={...} />; logo/testimonial rows use
  <Marquee>; hero/section imagery that should drift on scroll uses <ParallaxImage>.
  All of them already respect prefers-reduced-motion.
- For per-page <title>/meta, import { SEO } from '@/components/SEO' and render
  <SEO title="..." description="..." image="..." /> once near the top of the page.

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

HERO RULES:
- Hero sections: commit to the chosen variant. Full-bleed image hero = the image/media spans the full viewport width (w-full, outside any max-width container; the inner text content may be constrained). Split hero = each half fills its allotted space. Never render a full-bleed hero inside a padded/max-width parent.
- Full-bleed hero sections must span the full viewport: the section uses min-h-screen (or min-h-[100svh]) w-full with NO max-width constraint on the section or its background layer. Background image/media covers the entire section (absolute inset-0 w-full h-full object-cover or bg-cover). Only the inner text content may sit in a constrained container.
- The hero section must fully contain its own content: headline, subtext, CTAs and any scroll indicator must fit inside the section bounds without being clipped. If content exceeds the viewport height, allow the section to grow (min-h-screen, never h-screen with overflow-hidden).
- Hero content must not overlap: CTAs, headline and any scroll indicator need explicit vertical spacing (gap/margin); a scroll indicator sits below all CTAs with clearance (e.g. absolute bottom-6 with the content column padded to avoid it). Overlapping elements are a layout bug.
- The hero's background layer (img or gradient div) must be absolutely positioned to fill the SECTION (absolute inset-0 h-full w-full object-cover on a relative section) so it stretches with the section's height. Never give the background layer a fixed height — if the section grows (e.g. because the no-overlap rule pushed content taller), the background grows with it. A fixed-height background under a taller section leaves a visible gray/blank strip; the section must be relative and the background inset-0 so no such strip can appear.

ANTI-TEMPLATE / BRAND RULES (make every project look intentional, not shadcn-default):
- NEVER use emojis as visual elements (icons, decorations, headings, buttons, feature cards). Use lucide-react icons instead. Emojis only if the user explicitly asks for them.
- For images: if DESIGN.md contains an Approved Image Pool, use ONLY URLs from that pool, selecting each image by its description to match the section's content. Never invent images.unsplash.com URLs. Reuse pool images across sections only when unavoidable. Every image keeps a descriptive alt attribute and an aspect-ratio class. If no pool exists, fall back to the previous behavior. If the pool marks an image HERO in its Role column, that image is used ONLY in the hero section — no other section may use it, even when reuse would otherwise be unavoidable. When any pool image is used, the footer must include a discreet, small-text credits block: the text "Photos via Unsplash" linking to https://unsplash.com/?utm_source=wyrd_forge&utm_medium=referral, plus one credit for EACH image actually used in the site (not the full pool) with the photographer's name linked exactly as it appears in that image's Credit column of the pool. Style it unobtrusively, consistent with the rest of the footer.
- All colors MUST come from the brand CSS variables defined in src/index.css (--brand-*) or the existing semantic tokens. NEVER hardcode hex/HSL values in components.
- Brand CSS variables hold RAW HSL triplets. They MUST be consumed as hsl(var(--brand-x)) or hsl(var(--brand-x)/alpha). NEVER [color:var(--brand-x)] or var(--brand-x) bare — it produces invalid CSS that renders transparent.
- Contact information (address, phone, email, business hours) and brand name/tagline MUST be imported from src/data/site.ts (siteInfo). NEVER write literal contact data inside components. If a component needs a fact that siteInfo lacks, extend src/data/site.ts in the same step and import it.
- When consuming siteInfo, use the exact field structure shown in src/data/site.ts from the file context. hours is an array of {days, open, close} objects. Never assume a different shape.
- Typography, spacing, tone of copy and layout personality MUST follow DESIGN.md. Copy must be specific to the brand (no generic filler like 'Crafted with love').

SECTION GRANULARITY (mirror of the Architect's planning rule — one section = one file):
- Each visual section of a page lives in its OWN component file under src/components/sections/ (HeroSection.tsx, PricingSection.tsx, ContactSection.tsx...). A section component should stay under ~200 lines; if it grows past that, split subcomponents into the same folder rather than inflating one file.
- NEVER bundle multiple sections into a single catch-all file ('LandingSections', 'MainSections', or similar). If a step ever asks you to create several distinct sections in one file, honor the one-section-per-file rule and put each section in its own file instead — but with the Architect enforcing the same rule upstream, that case should not reach you.
`.trim();

/**
 * Build the STABLE project-context prefix shared by every Sonnet code lane
 * (Architect, Implementer, Verifier) — the cached breakpoint.
 *
 * REMATE (prefijo cacheado estable entre intents): this block contains ONLY
 * what is immutable per project across intents — the React/Tailwind rules and
 * the design brief. The design brief is generated once per project and threaded
 * unchanged into every lane, so this string is byte-identical not just across
 * lanes within one generation but across CONSECUTIVE INTENTS on the same
 * project. Marked with cache_control as the FIRST system block, it is written to
 * cache on the first Sonnet call and read back (cache_read) by every later call
 * inside the 5-minute window — including the first Sonnet of the next intent.
 *
 * The project blueprint (the list of all files currently in the project) is
 * DELIBERATELY excluded here: it mutates ~450 tokens between intents as files
 * are added, so folding it into this block would flip every intent's prefix to
 * a fresh cache_write with cache_read=0. It goes AFTER this marker as its own
 * block via buildBlueprintBlock() — cached for reuse within one intent, but
 * never poisoning the cross-intent prefix.
 *
 * An empty design brief is omitted so callers still get a stable (rules-only)
 * prefix.
 */
export function buildProjectContextPrefix(
  designContext?: string
): string {
  const parts: string[] = [REACT_TAILWIND_RULES];
  if (typeof designContext === 'string' && designContext.trim().length > 0) {
    parts.push(`DESIGN SYSTEM CONTEXT:\n${designContext.trim()}`);
  }
  return parts.join('\n\n');
}

/**
 * Build the MUTABLE blueprint block that follows the stable cached prefix.
 *
 * The blueprint (all files currently in the project) changes between intents, so
 * it lives in its own system block placed AFTER buildProjectContextPrefix(). It
 * is still worth a cache_control breakpoint: within a single intent it is
 * byte-identical across lanes and steps, so calls 2..N of the SAME intent read
 * it from cache. What it must never do is sit inside the stable prefix, where
 * its per-intent mutation would break the cross-intent cache_read.
 *
 * Returns '' when there is no blueprint so cachedSystemBlocks() drops it and the
 * system collapses cleanly to [stable prefix, role block].
 */
export function buildBlueprintBlock(blueprint?: string): string {
  if (typeof blueprint === 'string' && blueprint.trim().length > 0) {
    return `PROJECT BLUEPRINT (all files currently in the project):\n${blueprint.trim()}`;
  }
  return '';
}

/**
 * BACKEND_RULES — shared backend guidance for every lane that can generate
 * backend code (the legacy step executor, the heavy-lane fallback, and the
 * main Implementer pipeline).
 *
 * Used to live duplicated inline in AIOrchestrator with an unconditional
 * rule 1 ("any backend request gets a table + types.ts + hook") that pushed
 * data access into the browser even when the request had nothing to do with
 * client-side data, and a reactive rule 7 ("if the user asks for an Edge
 * Function") that only fired when the user knew Edge Functions exist and
 * asked for one by name — which the typical user of this platform never
 * does. Both are now conditional on what the request actually needs.
 */
export const BACKEND_RULES = `BACKEND RULES:
1. If the request needs client-side data access (e.g. "save this to the database", "create a user profile table", "list my orders"), perform this 3-step process:
   a. Generate a valid PostgreSQL CREATE TABLE statement wrapped in a file named \`supabase/migrations/<timestamp>_create_<table_name>.sql\`.
   b. Update or create \`src/integrations/supabase/types.ts\` to include the TypeScript interface for the new table.
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
   c. Create a custom hook \`src/hooks/use<Entity>.ts\` that encapsulates the Supabase client logic (select, insert, update, delete) using the generated types.
      Example for useTodos.ts:
      import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
      import { supabase } from '../integrations/supabase/client';
      export const useTodos = () => {
        const queryClient = useQueryClient();
        const fetchTodos = async () => { const { data, error } = await supabase.from('todos').select('*'); if (error) throw error; return data; };
        const addTodo = async (todo: any) => { const { data, error } = await supabase.from('todos').insert(todo).select(); if (error) throw error; return data; };
        return { todos: useQuery({ queryKey: ['todos'], queryFn: fetchTodos }), addTodo: useMutation({ mutationFn: addTodo, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['todos'] }) }) };
      };
2. Do NOT try to execute the SQL directly.
3. If the user asks to 'Mock' the data, generate a src/data.json file instead of SQL.
4. Use the \`cn()\` utility from \`src/lib/utils\` for merging Tailwind classes dynamically.
5. Recognize on your own — without the user ever naming "Edge Function" — when logic CANNOT live in the browser, and generate a Deno-compatible TypeScript file at \`supabase/functions/<slug>/index.ts\` (slug: lowercase letters, digits and hyphens only — the server rejects anything else with a 400). The typical user of this platform does not know Edge Functions exist and will never ask for one by name; you must decide this from what the request needs. Move logic server-side when ANY of these apply:
   a. It needs a secret the browser must never hold (a service-role key, a third-party API key such as an AI provider's).
   b. It needs to verify identity or permissions in a way the client cannot forge.
   c. It is logic the user must not be able to alter (moderation, calculations with real consequences, privileged writes).
6. If you need a Shadcn component (e.g., sheet, accordion, dialog) that is not currently in the src/components/ui folder, you MUST include 'npx shadcn-ui@latest add [component-name]' in the 'installCommands' array in your JSON response.`;
