/**
 * colorConversion — hex → HSL sin wrapper, en el formato exacto que
 * DesignBrief.palette espera ("H S% L%", p. ej. "24 90% 55%"), para poder
 * dropearlo directo en las variables CSS. Usado por el modo "Rueda de
 * color" del onboarding (mockup D, bucket 5 ítem 2): el usuario pica un hex
 * a mano y ese valor se fija como --brand-primary.
 */

/**
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number } | null}
 */
function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  const clean = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

/**
 * @param {string} hex — 6-digit hex, con o sin '#'.
 * @returns {string | null} "H S% L%" (sin hsl()), o null si `hex` no es válido.
 */
export function hexToHslString(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return `0 0% ${Math.round(l * 100)}%`;
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  h *= 60;

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
