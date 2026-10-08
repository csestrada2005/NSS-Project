// ---------------------------------------------------------------------------
// stripEmoji — las respuestas del chat van sin emojis (2026-10-08, Samuel:
// "cómo tú digas"). El prompt ya lo pedía y la IA los ponía igual (🏔 💧 🪂 en
// una tabla de precios), así que se quitan aquí, sin depender del modelo.
// Letras, acentos, números, símbolos de moneda y guiones no se tocan.
// ---------------------------------------------------------------------------

const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍|\p{Emoji_Modifier}|\p{Extended_Pictographic})*/gu;

const KEEP = new Set(['©', '®', '™']);

/**
 * @param {string} text
 * @returns {string}
 */
export function stripEmoji(text) {
  return String(text ?? '')
    // ©, ® y ™ cuentan como pictográficos en Unicode, pero son texto legal.
    .replace(EMOJI, (m) => (KEEP.has(m) ? m : ''))
    .replace(/️/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/gm, '');
}
