export const MAX_READING_CHARS_EACH: number;
export const MAX_READINGS_TOTAL_CHARS: number;
export function pickSavedReadings<T extends { id: string; kind: string; original_name: string; has_reading?: boolean }>(
  assets: T[],
  question: string,
  attachedIds?: Iterable<string>
): T[];
export function buildSavedReadingsNote(
  items: { kind: string; original_name: string; text: string; truncated?: boolean }[]
): string;
