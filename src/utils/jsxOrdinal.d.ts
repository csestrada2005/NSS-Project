/**
 * Type surface for the plain-JS ordinal locator (src/utils/jsxOrdinal.js).
 * Kept as a hand-written declaration so the browser build stays typed while the
 * implementation remains node-test-importable JavaScript.
 */

export interface OrdinalTarget {
  tagName?: string;
  ordinal: number;
}

export function updateCodeByOrdinal(
  fileContent: string,
  target: OrdinalTarget,
  updates: { className?: string; textContent?: string },
  options?: { classNameMode?: 'replace' | 'merge' },
  onNotFound?: (message: string) => void,
): string;

export function updateJSXPropByOrdinal(
  fileContent: string,
  target: OrdinalTarget,
  propName: string,
  propValue: string | boolean | number,
): string;
