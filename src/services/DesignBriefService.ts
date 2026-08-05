import { platformService } from './PlatformService';

/**
 * DesignBriefService — per-project design brief.
 *
 * Root cause this fixes: nothing gave the generation lanes a shared brand/design
 * context, so projects came out visually incoherent (shadcn defaults, mismatched
 * palettes, emoji decorations, same structure every time). On new-project
 * scaffold we ask the model for ONE small JSON brief and persist it as three
 * project files:
 *   - DESIGN.md            — the human-readable brief (mandatory context for lanes)
 *   - src/index.css        — 5 --brand-* CSS vars injected under :root
 *   - index.html           — Google Fonts <link> for the chosen heading/body fonts
 *
 * Everything here is best-effort: if the model call fails or the JSON does not
 * parse, scaffold() returns null and project creation continues WITHOUT a brief
 * (today's behavior). The brief must never block creating a project.
 */

export interface BrandColor {
  var: string;
  hsl: string;
}

/** One row of business hours. `hours` is ALWAYS an array of these. */
export interface SiteHours {
  days: string;  // e.g. "Mon–Fri" or "Saturday"
  open: string;  // e.g. "9:00"
  close: string; // e.g. "18:00"
}

/**
 * Single source of truth for the site's contact/business facts. Produced by the
 * brief so no component invents its own (which used to yield a Santiago address
 * in Contact and a Madrid address in Footer for the same project).
 *
 * The SHAPE here is deterministic (code, not the brief). The brief only supplies
 * values; anything that does not match this shape is rejected in validate() so a
 * consumer never receives, say, `hours` as a string and crashes on `.map()`.
 */
export interface SiteFacts {
  address: { street: string; city: string; country: string }; // coherent with each other and the domain
  phone: string;         // formatted for the chosen country
  email: string;         // domain derived from the brand name
  hours: SiteHours[];    // ALWAYS a non-empty array of {days, open, close}
}

/**
 * The exact, fixed shape written into src/data/site.ts. Matches the template in
 * renderSiteTs one-to-one so every produced site.ts compiles against it.
 */
export interface SiteInfoShape {
  name: string;
  tagline: string;
  address: { street: string; city: string; country: string };
  phone: string;
  email: string;
  hours: SiteHours[];
}

export interface DesignBrief {
  brand_name: string;
  tagline: string;
  tone: string;
  design_direction: string;
  palette: BrandColor[];
  fonts: { heading: string; body: string };
  imagery: string;
  facts?: SiteFacts;
}

/** The 5 brand CSS variables the brief must define, in order. */
const REQUIRED_BRAND_VARS = [
  '--brand-bg',
  '--brand-fg',
  '--brand-primary',
  '--brand-accent',
  '--brand-muted',
] as const;

const VALID_DIRECTIONS = new Set([
  'editorial-serif',
  'bold-geometric',
  'dark-cinematic',
  'soft-organic',
  'minimal-swiss',
]);

export class DesignBriefService {
  // -------------------------------------------------------------------------
  // JSON extraction — mirrors the defensive pattern used in Architect
  // (extractJsonArray/sanitizeJson) but for a single object.
  // -------------------------------------------------------------------------

  /** Extract the outermost JSON object from a model response. */
  private static extractJsonObject(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) return text.slice(start, end + 1);
    return '{}';
  }

  /**
   * Replace raw control characters that break JSON.parse when they appear
   * literally inside string values. Same targeted approach as Architect.
   */
  private static sanitizeJson(raw: string): string {
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
      if (inString && (ch === '\n' || ch === '\r' || ch === '\t')) {
        result += ' ';
        continue;
      }
      result += ch;
    }
    return result;
  }

  /** Validate and normalize a parsed object into a DesignBrief, or null. */
  private static validate(obj: unknown): DesignBrief | null {
    if (!obj || typeof obj !== 'object') return null;
    const o = obj as Record<string, unknown>;

    const str = (v: unknown): string | null =>
      typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;

    const brand_name = str(o.brand_name);
    const tagline = str(o.tagline);
    const tone = str(o.tone);
    const imagery = str(o.imagery);
    let design_direction = str(o.design_direction);

    if (!brand_name || !tagline || !tone || !imagery || !design_direction) return null;
    if (!VALID_DIRECTIONS.has(design_direction)) {
      // Keep the pipeline resilient to a slightly off value — fall back to a
      // safe default rather than discarding the whole brief.
      design_direction = 'minimal-swiss';
    }

    const fontsRaw = o.fonts as Record<string, unknown> | undefined;
    const heading = str(fontsRaw?.heading);
    const body = str(fontsRaw?.body);
    if (!heading || !body) return null;

    // Palette: exactly the 5 required vars. Accept any order, remap to the
    // canonical order, and require an hsl string for each.
    if (!Array.isArray(o.palette)) return null;
    const byVar = new Map<string, string>();
    for (const entry of o.palette) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const v = str(e.var);
      const hsl = str(e.hsl);
      if (v && hsl) byVar.set(v, hsl);
    }
    const palette: BrandColor[] = [];
    for (const v of REQUIRED_BRAND_VARS) {
      const hsl = byVar.get(v);
      if (!hsl) return null;
      palette.push({ var: v, hsl });
    }

    // Facts are best-effort: a valid brief without a usable facts block still
    // scaffolds (site.ts falls back to a placeholder). Only attach facts when
    // the WHOLE shape validates — address as {street,city,country}, and hours as
    // a non-empty array of {days,open,close}. A partial/mistyped facts block is
    // discarded so site.ts never gets written with a shape a consumer can't use.
    let facts: SiteFacts | undefined;
    const factsRaw = o.facts as Record<string, unknown> | undefined;
    if (factsRaw && typeof factsRaw === 'object') {
      const addrRaw = factsRaw.address as Record<string, unknown> | undefined;
      const street = addrRaw && typeof addrRaw === 'object' ? str(addrRaw.street) : null;
      const city = addrRaw && typeof addrRaw === 'object' ? str(addrRaw.city) : null;
      const country = addrRaw && typeof addrRaw === 'object' ? str(addrRaw.country) : null;

      const phone = str(factsRaw.phone);
      const email = str(factsRaw.email);

      const hours: SiteHours[] = [];
      if (Array.isArray(factsRaw.hours)) {
        for (const entry of factsRaw.hours) {
          if (!entry || typeof entry !== 'object') continue;
          const e = entry as Record<string, unknown>;
          const days = str(e.days);
          const open = str(e.open);
          const close = str(e.close);
          if (days && open && close) hours.push({ days, open, close });
        }
      }

      if (street && city && country && phone && email && hours.length > 0) {
        facts = { address: { street, city, country }, phone, email, hours };
      }
    }

    return {
      brand_name,
      tagline,
      tone,
      design_direction,
      palette,
      fonts: { heading, body },
      imagery,
      facts,
    };
  }

  // -------------------------------------------------------------------------
  // Brief generation
  // -------------------------------------------------------------------------

  /**
   * Ask the model for a design brief coherent with the user's prompt domain.
   * Returns null on any failure — the caller must fall back to no brief.
   */
  static async generate(prompt: string): Promise<DesignBrief | null> {
    const system =
      'You are a brand and design director. Given a short product description, ' +
      'produce a concise, opinionated design brief coherent with the product\'s ' +
      'domain. Respond with ONLY a raw JSON object (no markdown, no code fences, ' +
      'no prose) with EXACTLY this shape:\n' +
      '{\n' +
      '  "brand_name": string,   // coherent with the domain of the user prompt\n' +
      '  "tagline": string,\n' +
      '  "tone": string,         // 1 line: how the copy should sound\n' +
      '  "design_direction": string,   // exactly one of: "editorial-serif" | "bold-geometric" | "dark-cinematic" | "soft-organic" | "minimal-swiss", chosen for the domain\n' +
      '  "palette": [            // EXACTLY 5 entries, colors in HSL (e.g. "24 90% 55%")\n' +
      '    { "var": "--brand-bg", "hsl": "..." },\n' +
      '    { "var": "--brand-fg", "hsl": "..." },\n' +
      '    { "var": "--brand-primary", "hsl": "..." },\n' +
      '    { "var": "--brand-accent", "hsl": "..." },\n' +
      '    { "var": "--brand-muted", "hsl": "..." }\n' +
      '  ],\n' +
      '  "fonts": { "heading": string, "body": string },  // real Google Fonts family names\n' +
      '  "imagery": string,      // 1 line: photographic style for the domain\n' +
      '  "facts": {              // the site\'s real-sounding contact data — ONE coherent set\n' +
      '    "address": {          // an OBJECT with these three string fields\n' +
      '      "street": string,   // street line, e.g. "123 Market St"\n' +
      '      "city": string,     // city\n' +
      '      "country": string   // country — coherent with the city and phone code\n' +
      '    },\n' +
      '    "phone": string,      // formatted for the chosen country\n' +
      '    "email": string,      // domain derived from the brand name (e.g. hello@brandname.com)\n' +
      '    "hours": [            // an ARRAY with AT LEAST ONE object (never a string)\n' +
      '      { "days": string, "open": string, "close": string }  // e.g. { "days": "Mon–Fri", "open": "9:00", "close": "18:00" }\n' +
      '    ]\n' +
      '  }\n' +
      '}\n' +
      'The hsl values must be raw HSL channels WITHOUT the hsl() wrapper (e.g. ' +
      '"210 40% 96%"), so they can be dropped straight into CSS variables. ' +
      'Ensure --brand-fg has strong contrast against --brand-bg. The facts block ' +
      'must be internally consistent: the city and country in the address, the ' +
      'phone country code and the email domain must all belong to the same brand.';

    try {
      const response = await platformService.callForgeChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: `PRODUCT DESCRIPTION:\n${prompt}` }],
      });

      const data = await response.json();
      if (data.error) {
        console.warn('[DesignBriefService] API error:', data.error);
        return null;
      }

      const text: string = data.content?.[0]?.text ?? '';
      if (!text) return null;

      const parsed = JSON.parse(this.sanitizeJson(this.extractJsonObject(text)));
      const brief = this.validate(parsed);
      if (!brief) {
        console.warn('[DesignBriefService] Brief JSON failed validation, skipping.');
      }
      return brief;
    } catch (e) {
      console.warn('[DesignBriefService] generate() failed, continuing without brief:', e);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // File producers (pure functions — easy to reason about and test)
  // -------------------------------------------------------------------------

  /** Human-readable DESIGN.md contents for the given brief. */
  static toMarkdown(brief: DesignBrief): string {
    const paletteRows = brief.palette
      .map(c => `| \`${c.var}\` | \`${c.hsl}\` |`)
      .join('\n');

    return [
      `# Design Brief`,
      ``,
      `> This file is the mandatory design source of truth for this project.`,
      `> Every generated component must follow it: palette, fonts, tone and imagery.`,
      ``,
      `## Brand`,
      ``,
      `- **Name:** ${brief.brand_name}`,
      `- **Tagline:** ${brief.tagline}`,
      `- **Tone of copy:** ${brief.tone}`,
      `- **Design direction:** ${brief.design_direction}`,
      ``,
      `## Palette`,
      ``,
      `All colors MUST be referenced through these CSS variables (defined in \`src/index.css\`).`,
      `Never hardcode hex/HSL values in components.`,
      ``,
      `| Variable | HSL |`,
      `| --- | --- |`,
      paletteRows,
      ``,
      `## Typography`,
      ``,
      `- **Headings:** ${brief.fonts.heading}`,
      `- **Body:** ${brief.fonts.body}`,
      ``,
      `## Imagery`,
      ``,
      `${brief.imagery}`,
      `Use real photography from images.unsplash.com relevant to the domain. Never use`,
      `emoji placeholders or plain colored divs. Every image needs a descriptive alt`,
      `attribute and an aspect-ratio class.`,
      ``,
    ].join('\n');
  }

  /**
   * Inject the 5 --brand-* CSS variables under the first `:root {` block.
   * If no :root block exists, prepend a fresh one. Idempotent: existing
   * --brand-* declarations are removed before re-injecting.
   */
  static injectCssVars(css: string, brief: DesignBrief): string {
    const declarations = brief.palette
      .map(c => `    ${c.var}: ${c.hsl};`)
      .join('\n');
    const block = `\n    /* Brand palette (design brief) */\n${declarations}\n`;

    // Drop any prior brand declarations so re-running stays idempotent.
    let base = css.replace(/[ \t]*--brand-[\w-]+:[^;\n]*;[ \t]*\n?/g, '');
    base = base.replace(/[ \t]*\/\* Brand palette \(design brief\) \*\/[ \t]*\n?/g, '');

    const rootIdx = base.indexOf(':root {');
    if (rootIdx !== -1) {
      const insertAt = rootIdx + ':root {'.length;
      return base.slice(0, insertAt) + block + base.slice(insertAt);
    }

    // No :root — prepend one. Keep any leading @import/@tailwind lines on top.
    return `:root {${block}}\n\n${base}`;
  }

  /** Build a Google Fonts stylesheet URL for the heading + body families. */
  static buildFontHref(brief: DesignBrief): string {
    const fam = (name: string) =>
      `family=${encodeURIComponent(name.trim()).replace(/%20/g, '+')}:wght@400;500;600;700`;
    const families = [brief.fonts.heading, brief.fonts.body]
      .filter((v, i, arr) => arr.indexOf(v) === i) // dedupe if heading === body
      .map(fam)
      .join('&');
    return `https://fonts.googleapis.com/css2?${families}&display=swap`;
  }

  /**
   * Inject the Google Fonts <link> (with preconnect) into <head>. Idempotent:
   * a previously injected brief-fonts link is replaced.
   */
  static injectFontLink(html: string, brief: DesignBrief): string {
    const href = this.buildFontHref(brief);
    const marker = 'data-brief-fonts';
    const links =
      `    <link rel="preconnect" href="https://fonts.googleapis.com" ${marker} />\n` +
      `    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin ${marker} />\n` +
      `    <link rel="stylesheet" ${marker} href="${href}" />\n`;

    // Remove any prior brief-fonts links so re-running stays idempotent.
    const stripped = html.replace(
      new RegExp(`[ \\t]*<link[^>]*${marker}[^>]*>\\s*\\n?`, 'g'),
      ''
    );

    if (stripped.includes('</head>')) {
      return stripped.replace('</head>', `${links}  </head>`);
    }
    // No </head> — best effort: prepend the links.
    return links + stripped;
  }

  // -------------------------------------------------------------------------
  // SEO scaffold (P0-3) — title, meta description, Open Graph / Twitter cards,
  // robots.txt and a brand favicon. Generated projects used to ship with the
  // template's "Vite + React" title and no metadata; this gives every new
  // project sane, brand-derived SEO from the first scaffold. Idempotent via the
  // SEO_MARKER attribute so re-running never duplicates tags.
  // -------------------------------------------------------------------------

  static readonly SEO_MARKER = 'data-brief-seo';

  /** Neutral SEO fallbacks used when no brief could be produced. */
  static readonly SEO_FALLBACK = {
    title: 'Your App',
    description: 'A modern website built with Wyrd.',
    brandInitial: 'W',
    primaryHsl: '222 47% 40%',
  };

  private static escapeHtmlAttr(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** `<title>` text: "{brand} — {tagline}". */
  static buildSeoTitle(brandName: string, tagline: string): string {
    return `${brandName} — ${tagline}`;
  }

  /**
   * A ~150-char meta description derived from the tagline (and tone as a second
   * sentence when it fits). Collapses whitespace and truncates on a word
   * boundary with an ellipsis so it never exceeds ~155 chars.
   */
  static buildMetaDescription(tagline: string, tone: string): string {
    const raw = tone ? `${tagline}. ${tone}` : tagline;
    const collapsed = raw.replace(/\s+/g, ' ').trim();
    const LIMIT = 155;
    if (collapsed.length <= LIMIT) return collapsed;
    const cut = collapsed.slice(0, LIMIT);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
  }

  /**
   * Inject title + meta description + Open Graph + Twitter card + favicon link
   * into <head>. Replaces the template's <title> and strips any previously
   * injected SEO tags (SEO_MARKER) so the operation is idempotent.
   */
  static injectSeo(html: string, opts: { title: string; description: string }): string {
    const marker = this.SEO_MARKER;
    const t = this.escapeHtmlAttr(opts.title);
    const d = this.escapeHtmlAttr(opts.description);

    // Drop any prior SEO-marked tags so re-running does not duplicate them.
    let out = html.replace(
      new RegExp(`[ \\t]*<(?:meta|link)[^>]*${marker}[^>]*>\\s*\\n?`, 'g'),
      ''
    );

    // Title: replace the existing one, or add one before </head>.
    if (/<title>[\s\S]*?<\/title>/.test(out)) {
      out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
    } else if (out.includes('</head>')) {
      out = out.replace('</head>', `    <title>${t}</title>\n  </head>`);
    }

    const tags =
      `    <meta name="description" content="${d}" ${marker} />\n` +
      `    <meta property="og:title" content="${t}" ${marker} />\n` +
      `    <meta property="og:description" content="${d}" ${marker} />\n` +
      `    <meta property="og:type" content="website" ${marker} />\n` +
      `    <meta name="twitter:card" content="summary_large_image" ${marker} />\n` +
      `    <link rel="icon" type="image/svg+xml" href="/favicon.svg" ${marker} />\n`;

    if (out.includes('</head>')) {
      return out.replace('</head>', `${tags}  </head>`);
    }
    return tags + out;
  }

  /** Standard permissive robots.txt for public sites. */
  static robotsTxt(): string {
    return ['User-agent: *', 'Allow: /', ''].join('\n');
  }

  /**
   * Pick a readable text color (near-black or white) for a letter drawn over the
   * given HSL background, based on its lightness channel (the last `%` value).
   */
  private static faviconTextColor(hsl: string): string {
    const matches = hsl.match(/(\d+(?:\.\d+)?)%/g);
    const lightness = matches && matches.length > 0
      ? parseFloat(matches[matches.length - 1])
      : 50;
    return lightness > 60 ? '#111827' : '#ffffff';
  }

  /**
   * A self-contained SVG favicon: the brand's initial centered on a rounded
   * square filled with --brand-primary. The HSL channels are inlined (a favicon
   * is a standalone document and cannot read index.css variables). Valid SVG —
   * never a broken placeholder.
   */
  static buildFaviconSvg(brandInitial: string, primaryHsl: string): string {
    const letter = this.escapeHtmlAttr((brandInitial || 'W').trim().charAt(0).toUpperCase() || 'W');
    const text = this.faviconTextColor(primaryHsl);
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">`,
      `  <rect width="64" height="64" rx="12" fill="hsl(${primaryHsl})" />`,
      `  <text x="32" y="32" dy="0.35em" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="38" font-weight="700" fill="${text}">${letter}</text>`,
      `</svg>`,
      '',
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // Base wiring — body + headings. Kept between sentinel comments so both the
  // scaffold and the brief guard (AIOrchestrator) can locate, strip and rewrite
  // exactly this block without touching the rest of index.css.
  // -------------------------------------------------------------------------

  static readonly BASE_START = '/* design-brief:base:start */';
  static readonly BASE_END = '/* design-brief:base:end */';

  /** Fresh regex matching the sentinel-wrapped base block (no shared lastIndex). */
  static baseBlockRegex(): RegExp {
    return /\/\* design-brief:base:start \*\/[\s\S]*?\/\* design-brief:base:end \*\/\n?/g;
  }

  private static fontStack(name: string): string {
    return `'${name}', ui-sans-serif, system-ui, sans-serif`;
  }

  /**
   * The brief's base wiring: body background/foreground/font and heading font.
   * Same output used at scaffold time and when the guard restores a dropped
   * block, so the two never drift.
   */
  static buildBaseCss(headingFont: string, bodyFont: string): string {
    return [
      this.BASE_START,
      '@layer base {',
      '  body {',
      '    background-color: hsl(var(--brand-bg));',
      '    color: hsl(var(--brand-fg));',
      `    font-family: ${this.fontStack(bodyFont)};`,
      '  }',
      '  h1, h2, h3, h4, h5, h6 {',
      `    font-family: ${this.fontStack(headingFont)};`,
      '  }',
      '}',
      this.BASE_END,
    ].join('\n');
  }

  /** Append (idempotently) the brief's base wiring to the end of index.css. */
  static injectBaseCss(css: string, brief: DesignBrief): string {
    const stripped = css.replace(this.baseBlockRegex(), '').trimEnd();
    return `${stripped}\n\n${this.buildBaseCss(brief.fonts.heading, brief.fonts.body)}\n`;
  }

  // -------------------------------------------------------------------------
  // Single-source site data — src/data/site.ts
  // -------------------------------------------------------------------------

  private static tsLiteral(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }

  /**
   * The deterministic fallback values for site.ts. Every field is already the
   * exact shape the fixed template expects, so rendering these ALWAYS compiles.
   */
  private static readonly SITE_FALLBACK: SiteInfoShape = {
    name: 'Your Company',
    tagline: 'Your tagline goes here',
    address: {
      street: 'Set your address in src/data/site.ts',
      city: 'Your City',
      country: 'Your Country',
    },
    phone: '+1 (555) 000-0000',
    email: 'hello@example.com',
    hours: [{ days: 'Mon–Fri', open: '9:00', close: '18:00' }],
  };

  /**
   * Coerce a brief into the fixed site.ts shape, applying the fallback field by
   * field so the result NEVER violates the template. `validate()` already
   * guarantees `brief.facts` (when present) matches the shape via typeof checks
   * and Array.isArray, but we re-guard here so toSiteTs can never emit a site.ts
   * that fails to compile — the schema is code, not the brief.
   */
  private static coerceSiteInfo(brief: DesignBrief): SiteInfoShape {
    const fb = this.SITE_FALLBACK;
    const f = brief.facts;
    const validHours =
      f && Array.isArray(f.hours) && f.hours.length > 0 &&
      f.hours.every(
        h => h && typeof h.days === 'string' && typeof h.open === 'string' && typeof h.close === 'string'
      );
    const validAddress =
      f && f.address && typeof f.address === 'object' &&
      typeof f.address.street === 'string' &&
      typeof f.address.city === 'string' &&
      typeof f.address.country === 'string';

    return {
      name: typeof brief.brand_name === 'string' && brief.brand_name ? brief.brand_name : fb.name,
      tagline: typeof brief.tagline === 'string' && brief.tagline ? brief.tagline : fb.tagline,
      address: validAddress ? f!.address : fb.address,
      phone: f && typeof f.phone === 'string' && f.phone ? f.phone : fb.phone,
      email: f && typeof f.email === 'string' && f.email ? f.email : fb.email,
      hours: validHours ? f!.hours : fb.hours,
    };
  }

  /** src/data/site.ts built from the brief (facts + brand identity). */
  static toSiteTs(brief: DesignBrief): string {
    return this.renderSiteTs(this.coerceSiteInfo(brief));
  }

  /**
   * Minimal placeholder site.ts for when no brief could be produced. Keeps the
   * single-source contract intact so components always have siteInfo to import.
   */
  static placeholderSiteTs(): string {
    return this.renderSiteTs(this.SITE_FALLBACK);
  }

  /**
   * Render the FIXED site.ts template. The schema (field names, address object,
   * hours array) is hardcoded here — the brief only fills in the string values —
   * so a consumer can rely on `siteInfo.hours.map(...)` never crashing.
   */
  private static renderSiteTs(info: SiteInfoShape): string {
    const hoursRows = info.hours
      .map(
        h =>
          `  { days: ${this.tsLiteral(h.days)}, open: ${this.tsLiteral(h.open)}, close: ${this.tsLiteral(h.close)} },`
      )
      .join('\n');

    return [
      '// Single source of truth for the site\'s contact and brand data.',
      '// Every component MUST import contact/brand facts from here — never inline them.',
      '// SHAPE IS FIXED: address is an object, hours is an array of {days, open, close}.',
      'export const siteInfo = {',
      `  name: ${this.tsLiteral(info.name)},`,
      `  tagline: ${this.tsLiteral(info.tagline)},`,
      '  address: {',
      `    street: ${this.tsLiteral(info.address.street)},`,
      `    city: ${this.tsLiteral(info.address.city)},`,
      `    country: ${this.tsLiteral(info.address.country)},`,
      '  },',
      `  phone: ${this.tsLiteral(info.phone)},`,
      `  email: ${this.tsLiteral(info.email)},`,
      '  hours: [',
      hoursRows,
      '  ],',
      '} as const;',
      '',
      'export type SiteInfo = typeof siteInfo;',
      '',
    ].join('\n');
  }

  // -------------------------------------------------------------------------
  // Scaffold orchestration
  // -------------------------------------------------------------------------

  /**
   * Generate the brief and return the set of project files to write for it:
   * DESIGN.md, the updated src/index.css and the updated index.html. Returns
   * null when no brief could be produced (caller keeps today's behavior).
   *
   * `files` is the freshly-loaded template map — used as the base content for
   * the CSS/HTML injections.
   */
  static async scaffold(
    prompt: string,
    files: Map<string, string>
  ): Promise<Map<string, string> | null> {
    const brief = await this.generate(prompt);

    // Fallback: the brief failed but the single-source contract must still hold.
    // Write a placeholder src/data/site.ts and neutral SEO, then continue —
    // never block scaffold.
    if (!brief) {
      const out = new Map<string, string>();
      out.set('src/data/site.ts', this.placeholderSiteTs());
      out.set('public/robots.txt', this.robotsTxt());
      out.set(
        'public/favicon.svg',
        this.buildFaviconSvg(this.SEO_FALLBACK.brandInitial, this.SEO_FALLBACK.primaryHsl)
      );
      const html = files.get('index.html');
      if (typeof html === 'string') {
        out.set(
          'index.html',
          this.injectSeo(html, {
            title: this.SEO_FALLBACK.title,
            description: this.SEO_FALLBACK.description,
          })
        );
      }
      console.log('[DesignBriefService] scaffold: brief unavailable, wrote placeholder src/data/site.ts + neutral SEO');
      return out;
    }

    const out = new Map<string, string>();
    out.set('DESIGN.md', this.toMarkdown(brief));

    const css = files.get('src/index.css');
    if (typeof css === 'string') {
      // Vars first (into :root), then the body/headings wiring at the end.
      out.set('src/index.css', this.injectBaseCss(this.injectCssVars(css, brief), brief));
    }

    const html = files.get('index.html');
    if (typeof html === 'string') {
      // Brand fonts first, then SEO (title/description/OG/twitter/favicon link).
      const withFonts = this.injectFontLink(html, brief);
      out.set('index.html', this.injectSeo(withFonts, {
        title: this.buildSeoTitle(brief.brand_name, brief.tagline),
        description: this.buildMetaDescription(brief.tagline, brief.tone),
      }));
    }

    // SEO assets: permissive robots.txt + brand favicon (initial over --brand-primary).
    out.set('public/robots.txt', this.robotsTxt());
    const primaryHsl =
      brief.palette.find(c => c.var === '--brand-primary')?.hsl ?? this.SEO_FALLBACK.primaryHsl;
    out.set('public/favicon.svg', this.buildFaviconSvg(brief.brand_name, primaryHsl));

    // Single source of truth for the site's contact + brand data.
    out.set('src/data/site.ts', this.toSiteTs(brief));

    console.log('[DesignBriefService] scaffold produced files:', [...out.keys()],
      '| brand:', brief.brand_name, '| direction:', brief.design_direction,
      '| facts:', brief.facts ? 'from brief' : 'placeholder');

    return out;
  }
}
