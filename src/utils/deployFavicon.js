// ---------------------------------------------------------------------------
// deployFavicon — el ícono propio del proyecto (bloque 2, 2026-10-06, decisión
// de Samuel: se aplica AL PUBLICAR). Sólo se ajusta el paquete que va a
// Vercel: se añaden los dos PNG y el index.html apunta a ellos en lugar del
// favicon automático (letra sobre el color de la marca). El proyecto que se
// edita no se toca.
// ---------------------------------------------------------------------------

export const FAVICON_32_PATH = 'public/favicon-32.png';
export const APPLE_TOUCH_ICON_PATH = 'public/apple-touch-icon.png';

const ICON_LINK_RE = /[ \t]*<link\b[^>]*\brel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*>[ \t]*\r?\n?/gi;

const ICON_LINKS =
  '    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />\n' +
  '    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />\n';

/** index.html con los enlaces de ícono cambiados a los PNG propios. */
export function withCustomFaviconLinks(html) {
  const stripped = String(html ?? '').replace(ICON_LINK_RE, '');
  if (stripped.includes('</head>')) return stripped.replace('</head>', `${ICON_LINKS}  </head>`);
  return ICON_LINKS + stripped;
}

/**
 * Paquete de publicación con el ícono propio. Sin index.html no hay dónde
 * enlazarlo: se devuelve igual.
 * @param {Record<string, string | Uint8Array>} files
 * @param {{ png32: Uint8Array, png180: Uint8Array }} icon
 */
export function withCustomFavicon(files, icon) {
  if (!files || typeof files['index.html'] !== 'string' || !icon) return files;
  return {
    ...files,
    'index.html': withCustomFaviconLinks(files['index.html']),
    [FAVICON_32_PATH]: icon.png32,
    [APPLE_TOUCH_ICON_PATH]: icon.png180,
  };
}
