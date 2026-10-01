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
