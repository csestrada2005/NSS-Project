import { SupabaseService } from './SupabaseService';
import { pickBestMatch } from '../utils/designMatch.js';

// Filas de la base de diseño (UI/UX Pro Max), leídas UNA vez por sesión del
// navegador: son ~630 filas fijas. Antes eran hasta 3 consultas en serie por
// tabla en CADA pedido (medido: 4–17 s).
type Row = Record<string, any>;
interface DesignTables { products: Row[]; colors: Row[]; ui: Row[]; styles: Row[]; typography: Row[] }
let tablesPromise: Promise<DesignTables> | null = null;
const contextCache = new Map<string, string>();

function loadDesignTables(): Promise<DesignTables> {
  if (!tablesPromise) {
    const supabase = SupabaseService.getInstance().client;
    const all = async (table: string, columns: string) => {
      const { data, error } = await supabase.from(table).select(columns);
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data ?? []) as unknown as Row[];
    };
    const loading = Promise.all([
      all('products', 'product_type, keywords, landing_page_pattern, dashboard_style, key_considerations'),
      all('colors', '*'),
      all('ui_reasoning', 'ui_category, recommended_pattern, style_priority, color_mood, typography_mood, key_effects, anti_patterns'),
      all('styles', 'id, style_category, keywords, best_for, ai_prompt_keywords, css_technical_keywords, design_system_variables'),
      all('typography', 'id, font_pairing_name, best_for, mood_keywords, heading_font, body_font, css_import, tailwind_config'),
    ]).then(([products, colors, ui, styles, typography]) => ({ products, colors, ui, styles, typography }));
    // Si falla, el siguiente pedido lo vuelve a intentar.
    loading.catch(() => { if (tablesPromise === loading) tablesPromise = null; });
    tablesPromise = loading;
  }
  return tablesPromise;
}

function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${h}`;
}

export class DesignContextService {
  /**
   * Builds the design context injected into every generation lane.
   *
   * When the project carries a DESIGN.md (the per-project design brief generated
   * at scaffold), its contents are prepended verbatim under a mandatory header
   * so the brief always survives — it is never subject to the RAG truncation cap
   * and takes precedence over the generic product-type design context below.
   *
   * @param productType  the user prompt; only used for the lookup when the
   *                     project has no DESIGN.md yet (first generation)
   * @param files        optional project files map, used to surface DESIGN.md
   */
  public static async getContext(
    productType: string,
    files?: Map<string, string>
  ): Promise<string> {
    const briefBlock = this.buildBriefBlock(files);
    // Texto con el que se busca la ficha (bucket 6, 2026-09-30): el DESIGN.md
    // del proyecto si existe; si no (primera generación), el pedido, que ahí
    // sí describe el negocio. Antes era siempre la frase del pedido.
    const matchText = files?.get('DESIGN.md')?.trim() || productType;
    const cacheKey = hashText(matchText);
    const cached = contextCache.get(cacheKey);
    if (cached !== undefined) {
      console.log('[DesignContextService] cache hit');
      return briefBlock + cached;
    }
    try {
      const tables = await loadDesignTables();

      const product = pickBestMatch(
        matchText,
        tables.products.map((r) => ({ key: r.product_type, name: r.product_type, detail: r.keywords ?? '' }))
      );
      const productsRow = product ? tables.products.find((r) => r.product_type === product.key) ?? null : null;
      // Colores: la paleta del tipo elegido; sin tipo, la genérica de siempre.
      const colorsRow =
        tables.colors.find((r) => r.product_type === (product?.key ?? 'SaaS (General)')) ??
        tables.colors.find((r) => r.product_type === 'SaaS (General)') ??
        null;
      const ui = pickBestMatch(
        matchText,
        tables.ui.map((r) => ({ key: r.ui_category, name: r.ui_category, detail: r.color_mood ?? '' }))
      );
      const uiRow = ui ? tables.ui.find((r) => r.ui_category === ui.key) ?? null : null;
      const style = pickBestMatch(
        matchText,
        tables.styles.map((r) => ({ key: String(r.id), name: r.style_category ?? '', detail: `${r.best_for ?? ''} ${r.keywords ?? ''}` })),
        { minScore: 3 }
      );
      const stylesRow = style ? tables.styles.find((r) => String(r.id) === style.key) ?? null : null;
      const typo = pickBestMatch(
        matchText,
        tables.typography.map((r) => ({ key: String(r.id), name: r.font_pairing_name ?? '', detail: `${r.best_for ?? ''} ${r.mood_keywords ?? ''}` })),
        { minScore: 3 }
      );
      const typographyRow = typo ? tables.typography.find((r) => String(r.id) === typo.key) ?? null : null;

      let resultString = `=== DESIGN CONTEXT FOR ${product?.key ?? 'General'} ===\n\n`;

      if (colorsRow) {
        resultString += `COLORS:\n`;
        resultString += `primary: ${colorsRow.primary_color} (on-primary: ${colorsRow.on_primary})\n`;
        resultString += `secondary: ${colorsRow.secondary_color} (on-secondary: ${colorsRow.on_secondary})\n`;
        resultString += `accent: ${colorsRow.accent} (on-accent: ${colorsRow.on_accent})\n`;
        resultString += `background: ${colorsRow.background} | foreground: ${colorsRow.foreground}\n`;
        resultString += `card: ${colorsRow.card} | card-foreground: ${colorsRow.card_foreground}\n`;
        resultString += `muted: ${colorsRow.muted} | muted-foreground: ${colorsRow.muted_foreground}\n`;
        resultString += `border: ${colorsRow.border} | destructive: ${colorsRow.destructive} (on-destructive: ${colorsRow.on_destructive}) | ring: ${colorsRow.ring}\n`;
        resultString += `palette-notes: ${colorsRow.notes}\n\n`;
      }

      if (uiRow) {
        resultString += `UI REASONING:\n`;
        resultString += `pattern: ${uiRow.recommended_pattern}\n`;
        resultString += `style: ${uiRow.style_priority}\n`;
        resultString += `mood: ${uiRow.color_mood} | typography: ${uiRow.typography_mood}\n`;
        resultString += `effects: ${uiRow.key_effects}\n`;
        resultString += `avoid: ${uiRow.anti_patterns}\n\n`;
      }

      if (stylesRow) {
        const promptKeywords = (stylesRow.ai_prompt_keywords || '').slice(0, 500);
        const cssKeywords = stylesRow.css_technical_keywords || '';
        const variables = stylesRow.design_system_variables || '';
        resultString += `STYLE GUIDE:\n`;
        resultString += `prompt-keywords: ${promptKeywords}\n`;
        resultString += `css-keywords: ${cssKeywords}\n`;
        resultString += `variables: ${variables}\n\n`;
      }

      if (typographyRow) {
        resultString += `TYPOGRAPHY:\n`;
        resultString += `heading: ${typographyRow.heading_font} | body: ${typographyRow.body_font}\n`;
        resultString += `import: ${typographyRow.css_import}\n`;
        resultString += `tailwind: ${typographyRow.tailwind_config}\n\n`;
      }

      if (productsRow) {
        resultString += `PRODUCT CONTEXT:\n`;
        resultString += `layout-pattern: ${productsRow.landing_page_pattern}\n`;
        resultString += `dashboard-style: ${productsRow.dashboard_style}\n`;
        resultString += `considerations: ${productsRow.key_considerations}\n\n`;
      }

      resultString += `=== END DESIGN CONTEXT ===`;

      if (resultString.length > 2500) {
        resultString = resultString.substring(0, 2500);
      }

      console.log('[DesignContextService] match:', {
        product: product?.key ?? null,
        ui: ui?.key ?? null,
        style: stylesRow?.style_category ?? null,
        typography: typographyRow?.font_pairing_name ?? null,
        brief: briefBlock.length > 0,
      });

      // Mismo proyecto → misma ficha: se recuerda por el texto buscado. Además
      // deja el contexto byte-idéntico entre pedidos (prefijo cacheable).
      contextCache.set(cacheKey, resultString);
      if (contextCache.size > 50) contextCache.delete(contextCache.keys().next().value!);

      // The mandatory project brief is prepended AFTER the RAG cap so it is
      // never truncated and always leads the context.
      return briefBlock + resultString;
    } catch (err) {
      console.error('[DesignContextService]', err);
      // Even if the RAG lookup fails, the mandatory brief must still reach the
      // lanes when the project has one.
      return briefBlock;
    }
  }

  /**
   * If the project contains a DESIGN.md, returns it wrapped in the mandatory
   * header so it can be prepended to the design context. Empty string otherwise.
   */
  private static buildBriefBlock(files?: Map<string, string>): string {
    const brief = files?.get('DESIGN.md');
    if (typeof brief !== 'string' || brief.trim().length === 0) return '';
    return `PROJECT DESIGN BRIEF (mandatory):\n${brief.trim()}\n\n`;
  }
}
