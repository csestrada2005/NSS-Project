// ---------------------------------------------------------------------------
// markdownPreview — el último mensaje en la tarjeta pequeña del modal, como
// texto limpio (2026-10-08, Samuel): sin `**`, guiones ni barras de tabla.
// Cada fila de tabla queda en una línea "Ascenso Pico de Orizaba · $8,900 MXN".
// El historial completo sigue con su formato.
// ---------------------------------------------------------------------------

const SEPARATOR_ROW = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

/**
 * @param {string} text markdown de la IA
 * @returns {string} texto plano, una idea por línea
 */
export function markdownPreview(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inFence = false;
  for (const raw of lines) {
    let line = raw.trim();
    if (line.startsWith('```')) { inFence = !inFence; continue; }
    if (inFence || !line) continue;
    if (SEPARATOR_ROW.test(line)) continue;
    if (line.startsWith('|')) {
      line = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean).join(' · ');
    }
    line = line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^>\s?/, '')
      .replace(/^[-*+]\s+/, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();
    if (line) out.push(line);
  }
  return out.join('\n');
}
