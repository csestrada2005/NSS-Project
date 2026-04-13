import { SupabaseService } from './SupabaseService';

export class DesignContextService {
  public static async getContext(productType: string): Promise<string> {
    try {
      const supabase = SupabaseService.getInstance().client;

      // 1. Products Query: Exact match on product_type (no fallback)
      const productsRes = await supabase.from('products').select('*').eq('product_type', productType).maybeSingle();
      const productsRow = !productsRes.error ? productsRes.data : null;

      // 2. Colors Query: Exact match, then fallback to SaaS, then limit(1)
      let colorsRes = await supabase.from('colors').select('*').eq('product_type', productType).maybeSingle();
      if (!colorsRes.data && !colorsRes.error) {
        colorsRes = await supabase.from('colors').select('*').eq('product_type', 'SaaS (General)').maybeSingle();
        if (!colorsRes.data && !colorsRes.error) {
          colorsRes = await supabase.from('colors').select('*').limit(1).maybeSingle();
        }
      }
      const colorsRow = !colorsRes.error ? colorsRes.data : null;

      // 3. UI Reasoning Query: Match on ui_category, then fallback limit(1)
      let uiRes = await supabase.from('ui_reasoning').select('*').eq('ui_category', productType).maybeSingle();
      if (!uiRes.data && !uiRes.error) {
        uiRes = await supabase.from('ui_reasoning').select('*').limit(1).maybeSingle();
      }
      const uiRow = !uiRes.error ? uiRes.data : null;

      // 4. Styles Query: dynamic SaaS matching, no product_type column in table
      const isSaaS = /saas|app|software|b2b|cloud/i.test(productType);
      const styleMatchKeyword = isSaaS ? '%SaaS%' : `%${productType.split(' ')[0]}%`;
      let stylesRes = await supabase.from('styles').select('*').ilike('best_for', styleMatchKeyword).maybeSingle();
      if (!stylesRes.data && !stylesRes.error) {
         stylesRes = await supabase.from('styles').select('*').limit(1).maybeSingle();
      }
      const stylesRow = !stylesRes.error ? stylesRes.data : null;
      const stylesGate = !!stylesRow;

      // 5. Typography Query: match best_for using ilike
      let hasTypographyMatch = false;
      let typographyRes = await supabase.from('typography').select('*').ilike('best_for', `%${productType}%`).maybeSingle();

      if (typographyRes.data && !typographyRes.error) {
        hasTypographyMatch = true;
      } else if (!typographyRes.error) {
        // Fallback 1: Modern SaaS
        typographyRes = await supabase.from('typography').select('*').ilike('font_pairing_name', '%Modern SaaS%').maybeSingle();
        if (!typographyRes.data && !typographyRes.error) {
          // Final fallback
          typographyRes = await supabase.from('typography').select('*').limit(1).maybeSingle();
        }
      }
      const typographyRow = !typographyRes.error ? typographyRes.data : null;

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

      // Truncate to 2500 if necessary
      if (resultString.length > 2500) {
         resultString = resultString.substring(0, 2500);
      }

      console.log('[DesignContextService] injected sections:', { colors: !!colorsRow, uiReasoning: !!uiRow, styles: stylesGate, typography: hasTypographyMatch, products: !!productsRow });

      return resultString;
    } catch (err) {
      console.error('[DesignContextService]', err);
      return '';
    }
  }
}
