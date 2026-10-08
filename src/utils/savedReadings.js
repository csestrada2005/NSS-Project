// ---------------------------------------------------------------------------
// savedReadings — al CONTESTAR, la IA usa sola lo que ya leyó de un archivo
// (2026-10-08, decisión A de Samuel). "¿Están bien los precios con el PDF?"
// sin adjuntar nada: si el PDF tiene copia guardada, va con la pregunta, sin
// volver a pagar la lectura. Si nunca se leyó, la IA pide adjuntarlo.
// Sólo para el carril de respuestas (Chat y preguntas en Automático).
// ---------------------------------------------------------------------------

const DOC_WORDS = /\b(pdf|pdfs|documento|documentos|archivo|archivos|men[uú]|cat[aá]logo|document|documents|file|files|menu|catalog)\b/i;
const IMAGE_WORDS = /\b(foto|fotos|imagen|im[aá]genes|logo|logos|captura|screenshot|photo|photos|image|images|picture|pictures)\b/i;

export const MAX_READING_CHARS_EACH = 20000;
export const MAX_READINGS_TOTAL_CHARS = 40000;
const MAX_PICKED = 6;

const baseName = (name) => String(name ?? '').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
const words = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Qué archivos con copia guardada sirven para esta pregunta: los que nombra
 * (por su nombre sin extensión) y, si habla de "el PDF"/"la foto" en general,
 * los de ese tipo. Nunca los ya adjuntos (ésos llegan por su propio camino).
 * @param {{ id: string, kind: string, original_name: string, has_reading?: boolean }[]} assets
 * @param {string} question
 * @param {Iterable<string>} [attachedIds]
 * @returns {typeof assets}
 */
export function pickSavedReadings(assets, question, attachedIds = []) {
  const skip = new Set(attachedIds);
  const q = words(question);
  const read = (assets ?? []).filter((a) => a && a.has_reading && !skip.has(a.id));
  const named = read.filter((a) => {
    const base = words(baseName(a.original_name));
    if (base.length < 3) return false;
    // "menu_vertigo" se nombra como "menu vertigo" o "menu_vertigo".
    return q.includes(base) || q.includes(base.replace(/[_-]+/g, ' '));
  });
  const byKind = read.filter((a) =>
    (a.kind === 'document' && DOC_WORDS.test(q)) || (a.kind !== 'document' && IMAGE_WORDS.test(q))
  );
  const picked = [...new Map([...named, ...byKind].map((a) => [a.id, a])).values()];
  return picked.slice(0, MAX_PICKED);
}

/**
 * Nota para el modelo con las copias guardadas (recortadas por tamaño).
 * @param {{ kind: string, original_name: string, text: string, truncated?: boolean }[]} items
 * @returns {string} '' si no hay nada
 */
export function buildSavedReadingsNote(items) {
  let budget = MAX_READINGS_TOTAL_CHARS;
  const blocks = [];
  for (const item of items ?? []) {
    if (!item || typeof item.text !== 'string' || !item.text.trim() || budget <= 0) continue;
    const limit = Math.min(MAX_READING_CHARS_EACH, budget);
    const text = item.text.trim().slice(0, limit);
    budget -= text.length;
    const cut = item.truncated || item.text.trim().length > text.length;
    const kind = item.kind === 'document' ? 'document' : 'image';
    const label = kind === 'document'
      ? (cut ? 'content (TRUNCATED: only the first part)' : 'content')
      : 'what it shows';
    blocks.push(`- ${kind} "${item.original_name}" — ${label}:\n${text}`);
  }
  if (blocks.length === 0) return '';
  return [
    'SAVED READINGS of project files (you read them before; use them to answer — names, prices and numbers verbatim):',
    ...blocks,
  ].join('\n');
}
