/**
 * Type surface for the plain-JS palette matcher (src/utils/colorPaletteSuggest.js).
 * Hand-written so the browser build stays typed while the implementation
 * remains node-test-importable JavaScript — same arrangement as the rest of
 * src/utils/*.js.
 */

export interface SuggestedPaletteColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
}

export interface SuggestedPalette {
  productType: string;
  notes: string;
  colors: SuggestedPaletteColors;
  score: number;
}

export interface ProductRow {
  product_type?: string;
  keywords?: string;
}

export interface ColorRow {
  product_type?: string;
  primary_color?: string;
  secondary_color?: string;
  accent?: string;
  background?: string;
  foreground?: string;
  muted?: string;
  notes?: string;
}

export function suggestPalettes(
  promptText: string,
  productRows: ProductRow[],
  colorRows: ColorRow[],
  limit?: number
): SuggestedPalette[];
