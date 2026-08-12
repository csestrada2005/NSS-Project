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
- Supabase: import { SupabaseService } from '@/services/SupabaseService'; const supabase = SupabaseService.getInstance().client;
- The global CSS entry file is ALWAYS src/index.css. Never import globals.css, global.css, or any other CSS filename. Never create a new CSS entry file.
- Fonts are already loaded via <link> in index.html. NEVER import fonts — no @import in CSS, no URL imports in JS/TS.
- Export convention: every component file uses a named export matching the filename (export function ServicesSection...). Importers use the matching named import. Never mix default and named exports for components.
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
- For images: if DESIGN.md contains an Approved Image Pool, use ONLY URLs from that pool, selecting each image by its description to match the section's content. Never invent images.unsplash.com URLs. Reuse pool images across sections only when unavoidable. Every image keeps a descriptive alt attribute and an aspect-ratio class. If no pool exists, fall back to the previous behavior.
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
 * Build the static project-context prefix shared by every Sonnet code lane
 * (Architect, Implementer, Verifier) within a single generation — CAMBIO 1.
 *
 * The result is the React/Tailwind rules followed by the design brief/context
 * and the project blueprint. Because AIOrchestrator computes `designContext`
 * and `blueprint` ONCE per generation and threads the same values into all
 * three lanes, this string is byte-identical across them, so it caches on the
 * first call and reads back on every later call in the 5-minute window
 * (cache_read). Placed as the FIRST system block by each lane, it is the shared
 * cached prefix; the lane's own role instructions follow as a second block.
 *
 * Empty design/blueprint inputs are omitted so callers that have neither still
 * get a stable (rules-only) prefix.
 */
export function buildProjectContextPrefix(
  designContext?: string,
  blueprint?: string
): string {
  const parts: string[] = [REACT_TAILWIND_RULES];
  if (typeof designContext === 'string' && designContext.trim().length > 0) {
    parts.push(`DESIGN SYSTEM CONTEXT:\n${designContext.trim()}`);
  }
  if (typeof blueprint === 'string' && blueprint.trim().length > 0) {
    parts.push(`PROJECT BLUEPRINT (all files currently in the project):\n${blueprint.trim()}`);
  }
  return parts.join('\n\n');
}
