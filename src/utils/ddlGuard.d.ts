/**
 * Type surface for the plain-JS destructive-DDL detector (src/utils/ddlGuard.js).
 * Hand-written so the browser build stays typed while the implementation remains
 * node-test-importable JavaScript — same arrangement as deletionGuard.d.ts,
 * danglingRefs.d.ts e importGraph.d.ts.
 */

export type DestructiveKind = 'drop' | 'truncate' | 'delete_without_where' | 'drop_column';

export const DROP: 'drop';
export const TRUNCATE: 'truncate';
export const DELETE_WITHOUT_WHERE: 'delete_without_where';
export const DROP_COLUMN: 'drop_column';

export interface DestructiveFinding {
  /** Which destructive operation matched. */
  kind: DestructiveKind;
  /** The offending statement, whitespace-collapsed and truncated for display. */
  statement: string;
  /** 1-based line of the statement (or of the DROP clause, for drop_column). */
  line: number;
  /** The matched fragment, for a short human-readable label. */
  match: string;
  /**
   * Name of the object the statement destroys — the last segment, unquoted, of
   * the FIRST name it mentions (`DROP POLICY p ON t` reports `t`). This is what
   * the destructive-DDL modal asks the user to type. Empty when the statement
   * is too mangled to name one, which the modal treats as fail-closed.
   */
  target: string;
}

export interface SqlStatement {
  /** Original text of the statement, trimmed. */
  text: string;
  /** Same statement with comments and literals blanked out. */
  masked: string;
  /** Offset of `text` within the original SQL. */
  offset: number;
}

/** Blank comments and literals, preserving length and newlines. */
export function maskSqlNoise(sql: string): string;

/** Split into statements on top-level `;`. */
export function splitStatements(sql: string): SqlStatement[];

/** Every destructive operation in the SQL, in file order. */
export function findDestructiveDDL(sql: string): DestructiveFinding[];

/** True when the SQL contains at least one destructive operation. */
export function isDestructiveDDL(sql: string): boolean;

/** Unique, non-empty targets of the given findings, in order of appearance. */
export function destructiveTargets(findings: { target?: string }[]): string[];
