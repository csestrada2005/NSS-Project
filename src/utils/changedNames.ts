/**
 * Nombres legibles de los archivos cambiados, para los mensajes del chat:
 * "src/components/sections/FAQSection.tsx" → "FAQSection". Sin duplicados,
 * en el orden en que llegaron.
 */
export function changedNames(paths: string[]): string {
  return [...new Set(paths.map((p) => (p.split('/').pop() ?? p).replace(/\.[^./]+$/, '')))].join(', ');
}
