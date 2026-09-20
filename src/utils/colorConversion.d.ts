/**
 * Type surface for the plain-JS hex→HSL helper (src/utils/colorConversion.js).
 */

/** "H S% L%" (no hsl() wrapper) for a 6-digit hex color, or null if invalid. */
export function hexToHslString(hex: string): string | null;
