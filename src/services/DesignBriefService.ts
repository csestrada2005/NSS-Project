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

export interface DesignBrief {
  brand_name: string;
  tagline: string;
  tone: string;
  design_direction: string;
  palette: BrandColor[];
  fonts: { heading: string; body: string };
  imagery: string;
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

    return {
      brand_name,
      tagline,
      tone,
      design_direction,
      palette,
      fonts: { heading, body },
      imagery,
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
      '  "imagery": string       // 1 line: photographic style for the domain\n' +
      '}\n' +
      'The hsl values must be raw HSL channels WITHOUT the hsl() wrapper (e.g. ' +
      '"210 40% 96%"), so they can be dropped straight into CSS variables. ' +
      'Ensure --brand-fg has strong contrast against --brand-bg.';

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
    if (!brief) return null;

    const out = new Map<string, string>();
    out.set('DESIGN.md', this.toMarkdown(brief));

    const css = files.get('src/index.css');
    if (typeof css === 'string') {
      out.set('src/index.css', this.injectCssVars(css, brief));
    }

    const html = files.get('index.html');
    if (typeof html === 'string') {
      out.set('index.html', this.injectFontLink(html, brief));
    }

    console.log('[DesignBriefService] scaffold produced files:', [...out.keys()],
      '| brand:', brief.brand_name, '| direction:', brief.design_direction);

    return out;
  }
}
