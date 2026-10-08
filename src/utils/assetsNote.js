// ---------------------------------------------------------------------------
// assetsNote — la IA sabe qué fotos y documentos subió el usuario (bloque 1,
// 2026-10-05): "pon mi logo en el header" usa el archivo subido, con su
// dirección exacta, en vez de inventar una imagen o usar una de Unsplash.
// ---------------------------------------------------------------------------

const MAX_LISTED = 40;

/**
 * @param {{ kind: string, public_url: string, original_name: string, width?: number|null, height?: number|null }[]} assets
 * @returns {string} '' si el proyecto no tiene archivos
 */
export function buildAssetsNote(assets) {
  const list = (assets ?? []).filter((a) => a && typeof a.public_url === 'string').slice(0, MAX_LISTED);
  if (list.length === 0) return '';
  const lines = list.map((a) => {
    const size = a.width && a.height ? ` (${a.width}x${a.height})` : '';
    const kind = a.kind === 'document' ? 'document' : 'image';
    // Documento privado (2026-10-08): sin dirección, y la IA no debe enlazarlo.
    if (kind === 'document' && !a.public_url) {
      return `- document "${a.original_name}": PRIVATE — reference material only, never link or embed it on the site`;
    }
    return `- ${kind} "${a.original_name}"${size}: ${a.public_url}`;
  });
  return [
    'PROJECT FILES uploaded by the user (use these EXACT URLs when the request refers to them — e.g. "my logo", "the team photo", "the menu PDF"):',
    ...lines,
    'Prefer these over stock images when they fit. Images go in <img src="URL" alt="…"> with a descriptive alt; documents are linked (<a href="URL">), never inlined.',
  ].join('\n');
}
