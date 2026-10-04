/** Type surface for src/utils/piiPublicGuard.js (node-test-importable JS). */
export const PII_COLUMN: RegExp;
export function piiTablesInSql(sql: string): Map<string, string[]>;
export function piiTablesInProject(
  files: Map<string, string> | Iterable<[string, string]>,
  isMigration: (path: string) => boolean
): Map<string, string[]>;
export function stripPiiPublicRead(
  sql: string,
  knownPii?: Map<string, string[]>
): { sql: string; tables: string[]; details: { table: string; columns: string[] }[] };
export function codeReadingTables(changed: { path: string; content: string }[], tables: string[]): string[];
