type Step = { order: number; description: string; summary?: string; action: string; file_path: string };
export const PLAN_EDITED_MARK: string;
export function planAsEditableText(steps: Step[]): string;
export function buildEditedPlanInput(input: string, steps: Step[], edited: string): string;
export function addsDeletions(next: { action: string; file_path: string }[], previous: { action: string; file_path: string }[]): boolean;
