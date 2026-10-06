/** Type surface for src/utils/attachmentsNote.js (node-test-importable JS). */
export const ATTACHMENTS_OPEN: string;
export const ATTACHMENTS_CLOSE: string;
export const DOCUMENT_READ_MAX_TOKENS: number;
export const IMAGE_READ_MAX_TOKENS: number;
export const READER_MODEL: string;
export const IMAGE_READER_SYSTEM: string;
export const DOCUMENT_READER_SYSTEM: string;
export function needsReading(attachment: { kind: string; mime_type?: string } | null | undefined): boolean;
export function buildAttachmentsNote(
  items: {
    kind: string;
    mime_type?: string;
    public_url: string;
    original_name: string;
    width?: number | null;
    height?: number | null;
    text?: string;
    truncated?: boolean;
  }[]
): string;
export function compactAttachmentsNote(text: string): string;
