// ---------------------------------------------------------------------------
// attachmentsNote — adjuntos del chat (bloque 3, 2026-10-07, decisiones de
// Samuel): cada foto la MIRA una vez un lector (Haiku) y queda descrita por
// escrito; cada PDF se COPIA fielmente con tope. Esa nota acompaña al mensaje
// en todo el pedido (Architect, pasos del Implementer, carril simple, pregunta).
// Sin IA que vea la foto en cada paso: una sola lectura por mensaje.
// ---------------------------------------------------------------------------

export const ATTACHMENTS_OPEN = '<<ATTACHMENTS>>';
export const ATTACHMENTS_CLOSE = '<</ATTACHMENTS>>';

/** Tope de la copia de un PDF (~6,000 palabras). */
export const DOCUMENT_READ_MAX_TOKENS = 8000;
export const IMAGE_READ_MAX_TOKENS = 700;
export const READER_MODEL = 'claude-haiku-4-5-20251001';

export const IMAGE_READER_SYSTEM = [
  'You describe an image for a web developer who cannot see it and must use it on a website.',
  'Write plain text, at most 220 words, in this order:',
  '1. What it shows (subject, setting, any visible text quoted exactly).',
  '2. Dominant colors as approximate hex values, and the mood/style.',
  '3. If it is a screenshot or mockup of a website/app: its layout section by section (header, hero, grids, cards, footer), typography, spacing, corner radius, shadows — enough to recreate the look.',
  'Last line exactly: "ALT: <concise alt text>" written in the language of the user\'s request.',
  'No preamble, no opinions.',
].join('\n');

export const DOCUMENT_READER_SYSTEM = [
  'You transcribe a document so a web developer can build pages from its content.',
  'Copy the content FAITHFULLY as plain text: every name, price, number, date, address and wording exactly as written.',
  'Keep its structure: headings, lists, and tables as one line per row with " | " between cells.',
  'Do not summarize, translate, reorder, comment, or add anything. Skip only page numbers and repeated headers/footers.',
].join('\n');

/** Sólo SVG no se puede "mirar" (el lector no acepta vectores): va sólo su dirección. */
export function needsReading(attachment) {
  return attachment?.kind === 'document' || (attachment?.kind === 'image' && attachment?.mime_type !== 'image/svg+xml');
}

const clean = (text) => String(text ?? '').split(ATTACHMENTS_OPEN).join('').split(ATTACHMENTS_CLOSE).join('').trim();

/**
 * @param {{ kind: string, mime_type?: string, public_url: string, original_name: string, width?: number|null, height?: number|null, text?: string, truncated?: boolean }[]} items
 * @returns {string} '' sin adjuntos
 */
export function buildAttachmentsNote(items) {
  const list = (items ?? []).filter((a) => a && typeof a.public_url === 'string');
  if (list.length === 0) return '';
  const blocks = list.map((a) => {
    const size = a.width && a.height ? ` (${a.width}x${a.height})` : '';
    if (a.kind === 'document') {
      // Privado (2026-10-08): sin dirección; su contenido sí se usa.
      const head = a.public_url
        ? `- document "${a.original_name}": ${a.public_url}`
        : `- document "${a.original_name}" (PRIVATE — use its content, never link it on the site)`;
      const label = a.truncated
        ? '  Its content (faithful transcription, TRUNCATED: only the first part was read):'
        : '  Its content (faithful transcription):';
      return [head, label, clean(a.text)].join('\n');
    }
    const head = `- image "${a.original_name}"${size}: ${a.public_url}`;
    return a.text ? [head, '  What it shows (read by a vision model):', clean(a.text)].join('\n') : head;
  });
  return [
    ATTACHMENTS_OPEN,
    'ATTACHED TO THIS MESSAGE by the user (what they mean by "this photo", "this screenshot", "this PDF", "esta foto", "este PDF"…):',
    ...blocks,
    'Use image URLs EXACTLY in <img src> with the ALT given. A screenshot the user wants imitated is a style/layout reference: recreate its look, do not embed the screenshot unless asked. Use document content verbatim (names, prices, numbers); link the PDF with <a href> only if asked.',
    ATTACHMENTS_CLOSE,
  ].join('\n');
}

/** Para el log: la nota entera se cambia por un conteo (un PDF no va a forge_intent_log). */
export function compactAttachmentsNote(text) {
  const s = String(text ?? '');
  const start = s.indexOf(ATTACHMENTS_OPEN);
  if (start === -1) return s;
  const end = s.indexOf(ATTACHMENTS_CLOSE, start);
  const block = end === -1 ? s.slice(start) : s.slice(start, end + ATTACHMENTS_CLOSE.length);
  const images = (block.match(/^- image "/gm) ?? []).length;
  const documents = (block.match(/^- document "/gm) ?? []).length;
  const rest = end === -1 ? '' : s.slice(end + ATTACHMENTS_CLOSE.length);
  return `${s.slice(0, start).trimEnd()} [ATTACHMENTS:images=${images},documents=${documents}]${rest}`;
}
