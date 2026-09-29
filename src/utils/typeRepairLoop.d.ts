/** Type surface for src/utils/typeRepairLoop.js (plain JS, node-test-importable). */
import type { TypeIssue, TypecheckResult } from '../services/PlatformService';

export interface TypeRepairOutcome {
  status: 'clean' | 'errors' | 'unavailable';
  /** Última versión que compila y tiene menos errores de tipos (o la entrada intacta). */
  files: Map<string, string>;
  errors: TypeIssue[];
  unverifiable: TypeIssue[];
  autoFixed: number;
  fixCalls: number;
  rounds: number;
}

export function typeCheckTelemetry(
  status: 'clean' | 'errors' | 'unavailable' | undefined,
  errorCount: number
): string;

export function runTypeRepair(deps: {
  files: Map<string, string>;
  typecheck: (files: Map<string, string>, opts?: { autoFix?: boolean }) => Promise<TypecheckResult>;
  compile: (files: Map<string, string>) => Promise<boolean>;
  repair: (
    files: Map<string, string>,
    errors: TypeIssue[]
  ) => Promise<{ files: Map<string, string> | null; calls: number }>;
  maxRounds: number;
  isAborted?: () => boolean;
}): Promise<TypeRepairOutcome>;
