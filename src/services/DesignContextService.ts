import { SupabaseService } from './SupabaseService';

export class DesignContextService {
  public static async getContext(userPrompt: string): Promise<string> {
    try {
      const supabase = SupabaseService.getInstance().client;
      const lowerPrompt = userPrompt.toLowerCase();

      // 1. Fetch all product rows to filter client-side for simplicity
      const { data: allProducts, error: productsError } = await supabase
        .from('products')
        .select('*');

      let matchedProduct = null;
      let maxHits = 0;

      if (!productsError && allProducts) {
        for (const product of allProducts) {
          if (!product.keywords) continue;
          const keywords = product.keywords.split(',').map((k: string) => k.trim().toLowerCase());
          let hits = 0;
          for (const keyword of keywords) {
            if (keyword && lowerPrompt.includes(keyword)) {
              hits++;
            }
          }
          if (hits > maxHits) {
            maxHits = hits;
            matchedProduct = product;
          }
        }
      }

      // 2. Fallback to SaaS (General) if no product is found
      const productType = matchedProduct?.product_type || 'SaaS (General)';

      // 3. Query colors, ui_reasoning, styles
      const [colorsResult, uiResult, stylesResult] = await Promise.allSettled([
        supabase.from('colors').select('*').eq('product_type', productType).single(),
        supabase.from('ui_reasoning').select('*').eq('ui_category', productType).single(),
        supabase.from('styles').select('*').ilike('best_for', '%saas%').limit(1).single()
      ]);

      const colors = colorsResult.status === 'fulfilled' && !colorsResult.value.error ? colorsResult.value.data : null;
      const ui = uiResult.status === 'fulfilled' && !uiResult.value.error ? uiResult.value.data : null;
      const styles = stylesResult.status === 'fulfilled' && !stylesResult.value.error ? stylesResult.value.data : null;

      // 4. Format the result
      let resultString = `=== DESIGN CONTEXT ===\n`;
      resultString += `PRODUCT TYPE: ${productType}\n`;
      resultString += `STYLE: ${styles?.primary_style_recommendation || 'Modern Clean'}\n`;
      resultString += `LAYOUT PATTERN: ${styles?.landing_page_pattern || 'Hero Section > Features > Testimonials > CTA'}\n`;

      const primaryColor = colors?.primary_color || 'indigo-600';
      const accent = colors?.accent || 'purple-500';
      const background = colors?.background || 'slate-50';
      const foreground = colors?.foreground || 'slate-900';
      resultString += `COLORS: primary=${primaryColor}, accent=${accent}, background=${background}, foreground=${foreground}\n`;

      const recommendedPattern = ui?.recommended_pattern || 'Standard Grid';
      const stylePriority = ui?.style_priority || 'Clarity and Functionality';
      const antiPatterns = ui?.anti_patterns || 'Cluttered layouts, overly dark themes for no reason';
      resultString += `UI REASONING: ${recommendedPattern} | ${stylePriority} | anti-patterns: ${antiPatterns}\n`;

      resultString += `STYLE GUIDE: ${styles?.ai_prompt_keywords || 'clean, modern, accessible, professional'}\n`;
      resultString += `=== END DESIGN CONTEXT ===`;

      return resultString;
    } catch (err) {
      console.error('[DesignContextService]', err);
      return '';
    }
  }
}
