/** Type surface for src/utils/designMatch.js (node-test-importable JS). */
export function tokenize(text: string): Set<string>;
export function pickBestMatch(
  text: string,
  candidates: { key: string; name: string; detail?: string }[],
  opts?: { minScore?: number; nameWeight?: number }
): { key: string; score: number } | null;
export function businessText(text: string): string;
export function parseTypeChoice(
  reply: string,
  productTypes: string[],
  uiCategories: string[]
): { product: string | null; ui: string | null } | null;
