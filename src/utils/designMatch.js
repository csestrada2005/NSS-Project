// ---------------------------------------------------------------------------
// designMatch — qué fila de la base de diseño (UI/UX Pro Max: 161 tipos de
// producto, 70 estilos, 73 tipografías) corresponde a un proyecto (bucket 6,
// 2026-09-30). Antes se buscaba con la FRASE del pedido como `product_type`
// ("cambia el fondo de reseñas a negro") → nunca coincidía y caía siempre a
// la fila por defecto ("Modern SaaS"). Ahora se compara el texto del proyecto
// (su DESIGN.md, o el pedido inicial si aún no hay) con el nombre y las
// palabras clave de cada fila, y gana la que más palabras comparte.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  // en
  'the', 'and', 'for', 'with', 'your', 'you', 'our', 'that', 'this', 'from', 'are', 'not', 'all', 'any',
  'every', 'must', 'will', 'into', 'over', 'more', 'most', 'use', 'uses', 'used', 'using', 'app', 'apps',
  'site', 'sites', 'page', 'pages', 'web', 'website', 'design', 'brand', 'product', 'products', 'service',
  'services', 'general', 'platform', 'file', 'project', 'tone', 'copy', 'name', 'tagline', 'font', 'fonts',
  'color', 'colors', 'palette', 'primary', 'secondary', 'accent', 'background', 'mandatory', 'source',
  'truth', 'component', 'components', 'generated', 'follow', 'imagery', 'modern', 'clean', 'bold',
  // es
  'para', 'con', 'una', 'uno', 'los', 'las', 'del', 'que', 'por', 'sus', 'como', 'más', 'mas', 'pagina',
  'página', 'sitio', 'crea', 'haz', 'quiero',
]);

/**
 * Raíces de las palabras significativas: minúsculas, sin plural y cortadas a
 * 6 letras, para que "traveler" ≈ "travel" y "adventurous" ≈ "adventure".
 */
export function tokenize(text) {
  const out = new Set();
  for (const raw of String(text ?? '').toLowerCase().split(/[^a-záéíóúñü0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    const word = raw.length > 4 && raw.endsWith('s') ? raw.slice(0, -1) : raw;
    if (!STOPWORDS.has(word)) out.add(word.slice(0, 6));
  }
  return out;
}

/**
 * La candidata que más palabras comparte con el texto. Las palabras del
 * nombre de la fila pesan `nameWeight`; las de su descripción, 1.
 *
 * @param {string} text
 * @param {{ key: string, name: string, detail?: string }[]} candidates
 * @param {{ minScore?: number, nameWeight?: number }} [opts]
 * @returns {{ key: string, score: number } | null}
 */
export function pickBestMatch(text, candidates, { minScore = 2, nameWeight = 3 } = {}) {
  const words = tokenize(text);
  if (words.size === 0) return null;
  let best = null;
  for (const c of candidates ?? []) {
    const nameWords = tokenize(c.name);
    const detailWords = tokenize(c.detail);
    let score = 0;
    for (const w of nameWords) if (words.has(w)) score += nameWeight;
    for (const w of detailWords) if (!nameWords.has(w) && words.has(w)) score += 1;
    if (score > (best?.score ?? 0)) best = { key: c.key, score };
  }
  return best && best.score >= minScore ? best : null;
}

/**
 * Sólo la parte que describe el NEGOCIO: la sección "## Brand" del DESIGN.md
 * (nombre, lema, tono). El resto (paleta, tipografía, lista de imágenes con
 * "Photo by …" y URLs con "crop=") describe el diseño y confundía la búsqueda:
 * Vertigo salía "Photo Editor & Filters". Sin sección de marca, el texto tal
 * cual (p. ej. el pedido de la primera generación), recortado.
 */
export function businessText(text) {
  const source = String(text ?? '');
  const brand = /^##\s*Brand\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(source);
  return (brand ? brand[1] : source).trim().slice(0, 1500);
}

/**
 * Respuesta de la IA → nombres EXACTOS de la base, o null si no son de la
 * lista (la IA no puede inventar una categoría).
 */
export function parseTypeChoice(reply, productTypes, uiCategories) {
  try {
    const json = /\{[\s\S]*\}/.exec(String(reply ?? ''));
    const parsed = json ? JSON.parse(json[0]) : null;
    const product = productTypes.includes(parsed?.product) ? parsed.product : null;
    const ui = uiCategories.includes(parsed?.ui) ? parsed.ui : null;
    return product || ui ? { product, ui } : null;
  } catch {
    return null;
  }
}
