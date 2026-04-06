import { SupabaseService } from './SupabaseService';

export class DesignContextService {
  public static async getContext(productType: string): Promise<string> {
    try {
      const supabase = SupabaseService.getInstance().client;

      const [productsRes, colorsRes, uiRes, stylesRes, typographyRes] = await Promise.allSettled([
        supabase.from('products').select('*').eq('product_type', productType).maybeSingle(),
        supabase.from('colors').select('*').eq('product_type', productType).maybeSingle(),
        supabase.from('ui_reasoning').select('*').eq('ui_category', productType).maybeSingle(),
        supabase.from('styles').select('*').or(`best_for.ilike.%${productType}%,type.eq.General`).order('type', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('typography').select('*').or(`best_for.ilike.%${productType}%,font_pairing_name.eq.Modern SaaS`).limit(1).maybeSingle()
      ]);

      const productsRow = productsRes.status === 'fulfilled' && !productsRes.value.error ? productsRes.value.data : null;
      const colorsRow = colorsRes.status === 'fulfilled' && !colorsRes.value.error ? colorsRes.value.data : null;
      const uiRow = uiRes.status === 'fulfilled' && !uiRes.value.error ? uiRes.value.data : null;

      const stylesRow = stylesRes.status === 'fulfilled' && !stylesRes.value.error ? stylesRes.value.data : null;
      const stylesGate = !!stylesRow && typeof stylesRow.best_for === 'string' && stylesRow.best_for.toLowerCase().includes(productType.toLowerCase());

      const typographyRow = typographyRes.status === 'fulfilled' && !typographyRes.value.error ? typographyRes.value.data : null;
      let hasTypographyMatch = false;
      if (typographyRow && typeof typographyRow.best_for === 'string' && typographyRow.best_for.toLowerCase().includes(productType.toLowerCase())) {
        hasTypographyMatch = true;
      } else if (!typographyRow) {
        // Fallback: first row if the above returned null and no fallback was found
        const fallbackRes = await supabase.from('typography').select('*').limit(1).maybeSingle();
        if (!fallbackRes.error && fallbackRes.data) {
           // still false for hasTypographyMatch as it's not a match on best_for
        }
      }

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
