// ---------------------------------------------------------------------------
// statusLine — la frase de la tarjeta de progreso que escribe el clasificador
// (2026-10-08, P2 de Samuel): "Analizando si la foto sirve para la página".
// Viene de un modelo: se limpia y, si no sirve, no se usa (la tarjeta se queda
// con la etapa genérica).
// ---------------------------------------------------------------------------

const MAX_CHARS = 72;

/**
 * @param {unknown} raw
 * @returns {string | undefined} "Analizando si la foto sirve para la página…" o undefined
 */
export function cleanStatusLine(raw) {
  if (typeof raw !== 'string') return undefined;
  let line = raw.replace(/\s+/g, ' ').trim().replace(/^["'«“]+|["'»”]+$/g, '').trim();
  line = line.replace(/[.!…:;,\s]+$/, '');
  if (line.length < 4 || /[{}<>`]/.test(line)) return undefined;
  if (line.length > MAX_CHARS) line = line.slice(0, MAX_CHARS - 1).trimEnd();
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}…`;
}
