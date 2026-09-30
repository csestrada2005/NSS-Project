/**
 * Type surface for src/utils/targetHints.js (plain JS so node tests can
 * import it) — mismo arreglo que laneRouting.d.ts.
 */

export function normalizeText(text: string): string;
export function extractQuotedTexts(input: string): string[];
export function filesContainingText(
  text: string,
  files: Map<string, string>,
  isSelectable: (path: string) => boolean
): string[];
export function namedFiles(
  input: string,
  files: Map<string, string>,
  isSelectable: (path: string) => boolean
): string[];
export function resolveHintedTarget(
  input: string,
  files: Map<string, string>,
  isSelectable: (path: string) => boolean
): { path: string; method: 'quoted-text' | 'named-file' } | null;
export function snippetForTargeting(content: string, quotedTexts: string[], size?: number): string;
