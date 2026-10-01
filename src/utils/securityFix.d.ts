/** Type surface for src/utils/securityFix.js (node-test-importable JS). */
export function isSecurityFixRequest(prompt: unknown): boolean;
export function findingInstruction(finding: {
  kind: string;
  table?: string;
  policy?: string;
  cmd?: string;
  columns?: string[];
  path?: string;
  identifier?: string | null;
}): string;
export function buildSecurityFixPrompt(
  findings: { kind: string }[],
  t: (key: string, params: Record<string, string>) => string
): string;
export function filesFingerprint(files: Map<string, string> | Iterable<[string, string]>): string;
