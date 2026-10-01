/** Type surface for src/utils/piiPublicGuard.js (node-test-importable JS). */
export const PII_COLUMN: RegExp;
export function piiTablesInSql(sql: string): Map<string, string[]>;
export function stripPiiPublicRead(sql: string): { sql: string; tables: string[] };
