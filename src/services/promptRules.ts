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

ANTI-TEMPLATE / BRAND RULES (make every project look intentional, not shadcn-default):
- NEVER use emojis as visual elements (icons, decorations, headings, buttons, feature cards). Use lucide-react icons instead. Emojis only if the user explicitly asks for them.
- For imagery, use real photography from images.unsplash.com relevant to the project's domain and the imagery style in the design brief — never emoji placeholders or plain colored divs. Every image needs a descriptive alt attribute and an aspect-ratio class.
- All colors MUST come from the brand CSS variables defined in src/index.css (--brand-*) or the existing semantic tokens. NEVER hardcode hex/HSL values in components.
- Typography, spacing, tone of copy and layout personality MUST follow DESIGN.md. Copy must be specific to the brand (no generic filler like 'Crafted with love').
`.trim();
