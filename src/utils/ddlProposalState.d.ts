/**
 * Type surface for the plain-JS DDL proposal state resolver
 * (src/utils/ddlProposalState.js). Hand-written so the browser build stays
 * typed while the implementation remains node-test-importable JavaScript —
 * same arrangement as ddlGuard.d.ts, ddlVerdict.d.ts y migrationPath.d.ts.
 */

/** State of one `[DDL_PROPOSED:]` mark. At most one proposal is 'executable'. */
export type ProposalState =
  | 'executable'
  | 'superseded'
  | 'applied'
  | 'failed'
  | 'skipped';

/** Raw runner verdict carried by a `[DDL_OUTCOME:]` mark (MigrationOutcome). */
export type ProposalOutcome = 'applied' | 'failed' | 'unverified' | 'skipped';

export const EXECUTABLE: 'executable';
export const SUPERSEDED: 'superseded';
export const APPLIED: 'applied';
export const FAILED: 'failed';
export const SKIPPED: 'skipped';

export const OUTCOME_APPLIED: 'applied';
export const OUTCOME_FAILED: 'failed';
export const OUTCOME_UNVERIFIED: 'unverified';
export const OUTCOME_SKIPPED: 'skipped';

/** One proposal found in the chat history, with its derived state. */
export interface DdlProposal {
  /** Migration paths the proposal covers, in mark order. */
  paths: string[];
  /** Identity of the proposal: `paths.join(',')`. */
  key: string;
  /** Index of the message carrying the `[DDL_PROPOSED:]` mark. */
  messageIndex: number;
  /** Runner verdict once the button ran, else null. */
  outcome: ProposalOutcome | null;
  /** Index of the message carrying the verdict, else null. */
  outcomeMessageIndex: number | null;
  /** Derived state. 'unverified' collapses into 'failed'; see `outcome`. */
  state: ProposalState;
}

/** Minimal shape this module reads off the chat history. */
export interface ProposalSourceMessage {
  role?: string;
  content?: string;
}

/** Trim, keep only `supabase/migrations/*.sql`, dedupe, preserve order. */
export function normalizeProposalPaths(paths: Iterable<string>): string[];

/** ` [DDL_PROPOSED:a,b]` for the assistant message; '' when there are none. */
export function ddlProposedMark(paths: Iterable<string>): string;

/** ` [DDL_OUTCOME:<outcome>:a,b]`; '' when outcome or paths are invalid. */
export function ddlOutcomeMark(outcome: string, paths: Iterable<string>): string;

/** The message text without any DDL mark, for display. */
export function stripDdlMarks(content: string): string;

/** Every proposal in the history, chronologically, with its state. */
export function resolveDdlProposals(messages: ProposalSourceMessage[]): DdlProposal[];

/** The one executable proposal, or null. Call this again at click time. */
export function findExecutableProposal(messages: ProposalSourceMessage[]): DdlProposal | null;

/** True when `proposal` is still THE executable one for the current history. */
export function isStillExecutable(
  messages: ProposalSourceMessage[],
  proposal: { key?: string } | null | undefined
): boolean;

/** What the button writes to the chat after running: user text + closing mark. */
export function buildOutcomeMessage(result: {
  outcome: string;
  paths: Iterable<string>;
  /** Paths of a batch that DID apply before it stopped. */
  appliedPaths?: Iterable<string>;
  /** Tables the schema diff showed touched. */
  tables?: Iterable<string>;
  /** Runner reason, brackets stripped before it reaches the message. */
  reason?: string | null;
  /** Path whose run produced a non-applied verdict. */
  failedPath?: string | null;
}): string;
