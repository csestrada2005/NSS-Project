/**
 * colorPaletteSuggest — matching determinista entre la descripción libre que
 * el usuario escribe al crear un proyecto y las paletas reales de la tabla
 * `colors` (DB principal de Wyrd). Parte del ítem 2, bucket 5 (onboarding de
 * proyecto, mockup D): el usuario elige "Sugerido por el prompt" y ve hasta 3
 * paletas reales, no inventadas — nunca cifras ni nombres fabricados.
 *
 * DE DÓNDE SALEN LOS DATOS
 * -------------------------
 * `colors` y `products` viven en la DB PRINCIPAL de Wyrd (no en un fixture),
 * espejo de las tablas del skill ui-ux-pro-max (Samuel confirmó ambas, más
 * `styles`/`typography`/`ui_reasoning` para trabajo futuro). Se leen con el
 * cliente normal de Supabase (mismo patrón que PatternRetriever.fetchByIds
 * contra forge_patterns) — este módulo NO hace red, sólo recibe las filas ya
 * cargadas y decide el ranking. Columnas reales de `colors` (verificadas
 * contra information_schema.columns, no adivinadas): product_type,
 * primary_color, on_primary, secondary_color, on_secondary, accent,
 * on_accent, background, foreground, card, card_foreground, muted,
 * muted_foreground, border, destructive, on_destructive, ring, notes — este
 * módulo sólo usa el subconjunto que el brief de diseño necesita (ver
 * DesignBriefService.applyPaletteHints). `products.keywords` es texto libre
 * separado por coma/punto y coma, más rico para matching que el
 * `product_type` solo de `colors`.
 *
 * SCORING
 * -------
 * Por cada fila de `products`: +3 si la frase completa de `product_type`
 * aparece en el prompt; por cada término de `keywords` que aparece en el
 * prompt, +2 si el término tiene 3+ caracteres (específico), +1 si es más
 * corto (palabra genérica, menos señal). product_type con score 0 se
 * descarta. Empate → orden original de la tabla (estable). El resultado se
 * une con `colors` por `product_type` exacto; un `product_type` sin fila de
 * color correspondiente se ignora (nunca revienta).
 */

/**
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return typeof text === 'string' ? text.toLowerCase() : '';
}

/**
 * @param {string} keywords
 * @returns {string[]}
 */
function splitKeywords(keywords) {
  if (typeof keywords !== 'string' || keywords.trim() === '') return [];
  return keywords
    .split(/[,;]/)
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
}

/**
 * @param {string} promptNorm
 * @param {{ product_type?: string, keywords?: string }} product
 * @returns {number}
 */
function scoreProduct(promptNorm, product) {
  let score = 0;
  const productType = normalize(product.product_type);
  if (productType && promptNorm.includes(productType)) {
    score += 3;
  }
  for (const term of splitKeywords(product.keywords)) {
    if (promptNorm.includes(term)) {
      score += term.length >= 3 ? 2 : 1;
    }
  }
  return score;
}

/**
 * @typedef {Object} SuggestedPalette
 * @property {string} productType
 * @property {string} notes
 * @property {{ primary: string, secondary: string, accent: string, background: string, foreground: string, muted: string }} colors
 * @property {number} score
 */

/**
 * @param {string} promptText
 * @param {Array<{ product_type?: string, keywords?: string }>} productRows
 * @param {Array<{ product_type?: string, primary_color?: string, secondary_color?: string, accent?: string, background?: string, foreground?: string, muted?: string, notes?: string }>} colorRows
 * @param {number} [limit]
 * @returns {SuggestedPalette[]}
 */
export function suggestPalettes(promptText, productRows, colorRows, limit = 3) {
  const promptNorm = normalize(promptText);
  if (!promptNorm || !Array.isArray(productRows) || !Array.isArray(colorRows)) return [];

  const colorsByType = new Map();
  for (const row of colorRows) {
    if (row && typeof row.product_type === 'string' && !colorsByType.has(row.product_type)) {
      colorsByType.set(row.product_type, row);
    }
  }

  const scored = productRows
    .map((product) => ({ product, score: scoreProduct(promptNorm, product) }))
    .filter((entry) => entry.score > 0);

  // Sort desc by score; Array#sort is stable in Node/V8, so equal scores
  // keep the original table order.
  scored.sort((a, b) => b.score - a.score);

  /** @type {SuggestedPalette[]} */
  const results = [];
  const seenTypes = new Set();
  for (const { product, score } of scored) {
    const productType = product.product_type;
    if (!productType || seenTypes.has(productType)) continue;
    const colorRow = colorsByType.get(productType);
    if (!colorRow) continue;
    seenTypes.add(productType);
    results.push({
      productType,
      notes: colorRow.notes ?? '',
      colors: {
        primary: colorRow.primary_color ?? '',
        secondary: colorRow.secondary_color ?? '',
        accent: colorRow.accent ?? '',
        background: colorRow.background ?? '',
        foreground: colorRow.foreground ?? '',
        muted: colorRow.muted ?? '',
      },
      score,
    });
    if (results.length >= limit) break;
  }

  return results;
}
