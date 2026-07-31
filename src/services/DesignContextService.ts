import { SupabaseService } from './SupabaseService';

export class DesignContextService {
  /**
   * Builds the design context injected into every generation lane.
   *
   * When the project carries a DESIGN.md (the per-project design brief generated
   * at scaffold), its contents are prepended verbatim under a mandatory header
   * so the brief always survives — it is never subject to the RAG truncation cap
   * and takes precedence over the generic product-type design context below.
   *
   * @param productType  the user prompt / product type used for RAG lookup
   * @param files        optional project files map, used to surface DESIGN.md
   */
  public static async getContext(
    productType: string,
    files?: Map<string, string>
  ): Promise<string> {
    const briefBlock = this.buildBriefBlock(files);
    try {
      const supabase = SupabaseService.getInstance().client;

      let hasTypographyMatch = false;

      const [productsRes, colorsRes, uiRes, stylesRes, typographyRes] = await Promise.allSettled([
        supabase.from('products').select('*').eq('product_type', productType).maybeSingle(),
        (async () => {
          let res = await supabase.from('colors').select('*').eq('product_type', productType).maybeSingle();
          if (!res.data && !res.error) res = await supabase.from('colors').select('*').eq('product_type', 'SaaS (General)').maybeSingle();
          if (!res.data && !res.error) res = await supabase.from('colors').select('*').limit(1).maybeSingle();
          return res;
        })(),
        (async () => {
          let res = await supabase.from('ui_reasoning').select('*').eq('ui_category', productType).maybeSingle();
          if (!res.data && !res.error) res = await supabase.from('ui_reasoning').select('*').limit(1).maybeSingle();
          return res;
        })(),
        (async () => {
          const isSaaS = /saas|app|software|b2b|cloud/i.test(productType);
          const styleMatchKeyword = isSaaS ? '%SaaS%' : `%${productType.split(' ')[0]}%`;
          let res = await supabase.from('styles').select('*').ilike('best_for', styleMatchKeyword).maybeSingle();
          if (!res.data && !res.error) res = await supabase.from('styles').select('*').limit(1).maybeSingle();
          return res;
        })(),
        (async () => {
          const res = await supabase.from('typography').select('*').ilike('best_for', `%${productType}%`).maybeSingle();
          if (res.data && !res.error) {
            hasTypographyMatch = true;
            return res;
          }
          const fb1 = await supabase.from('typography').select('*').ilike('font_pairing_name', '%Modern SaaS%').maybeSingle();
          if (fb1.data && !fb1.error) return fb1;
          return supabase.from('typography').select('*').limit(1).maybeSingle();
        })()
      ]);

      const productsRow = productsRes.status === 'fulfilled' && !productsRes.value.error ? productsRes.value.data : null;
      const colorsRow = colorsRes.status === 'fulfilled' && !colorsRes.value.error ? colorsRes.value.data : null;
      const uiRow = uiRes.status === 'fulfilled' && !uiRes.value.error ? uiRes.value.data : null;

      const stylesRow = stylesRes.status === 'fulfilled' && !stylesRes.value.error ? stylesRes.value.data : null;
      const stylesGate = !!stylesRow && typeof stylesRow.best_for === 'string' && stylesRow.best_for.toLowerCase().includes(productType.toLowerCase());

      const typographyRow = typographyRes.status === 'fulfilled' && !typographyRes.value.error ? typographyRes.value.data : null;

      let resultString = `=== DESIGN CONTEXT FOR ${productType} ===\n\n`;

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

      if (stylesGate && stylesRow) {
        const promptKeywords = (stylesRow.ai_prompt_keywords || '').slice(0, 500);
        const cssKeywords = stylesRow.css_technical_keywords || '';
        const variables = stylesRow.design_system_variables || '';
        resultString += `STYLE GUIDE:\n`;
        resultString += `prompt-keywords: ${promptKeywords}\n`;
        resultString += `css-keywords: ${cssKeywords}\n`;
        resultString += `variables: ${variables}\n\n`;
      }

      if (hasTypographyMatch && typographyRow) {
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

      console.log('[DesignContextService] injected sections:', { colors: !!colorsRow, uiReasoning: !!uiRow, styles: stylesGate, typography: hasTypographyMatch, products: !!productsRow, brief: briefBlock.length > 0 });

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
