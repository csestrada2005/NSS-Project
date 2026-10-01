/** Type surface for src/utils/migrationContext.js (node-test-importable JS). */
export function buildPendingMigrationNote(
  pendingPaths: string[] | null | undefined,
  files: Map<string, string>
): string;
export function checkMigrationPlan(
  steps: { action?: string; file_path?: string }[],
  pendingPaths: string[] | null | undefined,
  files: Map<string, string>
): { notMerged: string[]; touchesApplied: string[] };
export function indexMigrationObjects(
  files: Map<string, string>,
  exclude?: Iterable<string>
): Map<string, { kind: string; name: string; paths: string[] }>;
export function buildMigrationObjectsNote(files: Map<string, string>, pendingPaths: string[] | null | undefined): string;
export function relatedMigrationDefinitions(
  text: string,
  files: Map<string, string>,
  exclude?: Iterable<string>,
  opts?: { maxFiles?: number; maxChars?: number }
): string;
