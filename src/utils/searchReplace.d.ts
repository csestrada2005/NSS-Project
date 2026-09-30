/** Type surface for src/utils/searchReplace.js (node-test-importable JS). */
export interface EditBlock {
  search: string;
  replace: string;
}
export interface EditFailure {
  index: number;
  reason: 'not-found' | 'ambiguous';
  count: number;
}
export function parseEditBlocks(text: string): EditBlock[];
export function applyEditBlocks(
  content: string,
  blocks: EditBlock[]
): { content: string | null; failures: EditFailure[] };
export function describeFailures(failures: EditFailure[], blocks: EditBlock[]): string;
export function wantsFullRewrite(input: string): boolean;
