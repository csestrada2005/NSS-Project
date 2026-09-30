/** Type surface for src/utils/stageTimer.js (node-test-importable JS). */
export interface StageTimer {
  mark(name: string): void;
  summary(): string;
  stages: { name: string; ms: number }[];
}
export function createStageTimer(now?: () => number): StageTimer;
