import { SupabaseService } from './SupabaseService';

export class DesignContextService {
  static async fetchForPrompt(productType: string): Promise<string> {
    try {
      const supabase = SupabaseService.getInstance().client;

      const [uiResult, colorsResult] = await Promise.allSettled([
        supabase
          .from('ui_reasoning')
          .select('recommended_pattern, style_priority, color_mood, typography_mood, key_effects, decision_rules, anti_patterns')
          .ilike('ui_category', `%${productType}%`)
          .limit(1)
          .single(),
        supabase
          .from('colors')
          .select('primary_color, secondary_color, accent, background, foreground, muted, border, notes')
          .ilike('product_type', `%${productType}%`)
          .limit(1)
          .single(),
      ]);

      const ui = uiResult.status === 'fulfilled' && !uiResult.value.error ? uiResult.value.data : null;
      const colors = colorsResult.status === 'fulfilled' && !colorsResult.value.error ? colorsResult.value.data : null;

      if (!ui && !colors) return '';

      const lines: string[] = [`=== DESIGN CONTEXT FOR: ${productType} ===`];

      if (ui) {
        if (ui.recommended_pattern) lines.push(`RECOMMENDED PATTERN: ${ui.recommended_pattern}`);
        if (ui.style_priority) lines.push(`STYLE PRIORITY: ${ui.style_priority}`);

        const colorMoodPart = ui.color_mood ? ui.color_mood : null;
        const primaryPart = colors?.primary_color ? `Primary: ${colors.primary_color}` : null;
        const accentPart = colors?.accent ? `Accent: ${colors.accent}` : null;
        const colorParts = [colorMoodPart, primaryPart, accentPart].filter(Boolean);
        if (colorParts.length > 0) lines.push(`COLOR MOOD: ${colorParts.join(' | ')}`);

        if (ui.typography_mood) lines.push(`TYPOGRAPHY: ${ui.typography_mood}`);
        if (ui.key_effects) lines.push(`KEY EFFECTS: ${ui.key_effects}`);
        if (ui.decision_rules) lines.push(`DECISION RULES: ${JSON.stringify(ui.decision_rules)}`);
        if (ui.anti_patterns) lines.push(`ANTI-PATTERNS (avoid these): ${ui.anti_patterns}`);
      } else if (colors) {
        const primaryPart = colors.primary_color ? `Primary: ${colors.primary_color}` : null;
        const accentPart = colors.accent ? `Accent: ${colors.accent}` : null;
        const colorParts = [primaryPart, accentPart].filter(Boolean);
        if (colorParts.length > 0) lines.push(`COLOR MOOD: ${colorParts.join(' | ')}`);
      }

      lines.push(`=== END DESIGN CONTEXT ===`);

      return lines.join('\n');
    } catch {
      return '';
    }
  }
}
