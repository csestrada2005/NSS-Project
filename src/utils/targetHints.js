// ---------------------------------------------------------------------------
// targetHints — pistas que el usuario YA dio para elegir el archivo a editar
// (bucket 6, 2026-09-30). Caso de Samuel en Vertigo: "Cambia el color del
// título "Choose your edge" en ExpeditionsSection.tsx" terminó en "No veo
// ExpeditionsSection.tsx": el targeting (Haiku) sólo ve los primeros 1500
// caracteres de cada candidato y el título está en el 6374 ("Choose Your
// Edge", otras mayúsculas). El texto citado y el archivo nombrado bastan para
// decidir sin adivinar; y si hay que preguntarle al Haiku, se le muestra el
// trozo donde está lo citado, no el principio del archivo.
// ---------------------------------------------------------------------------

const QUOTED = /"([^"\n]{3,200})"|“([^”\n]{3,200})”|«([^»\n]{3,200})»|`([^`\n]{3,200})`/g;
const FILE_NAME = /[\w-]+\.(?:tsx|ts|jsx|js)\b/g;
// Nombre de componente sin extensión: PascalCase con al menos dos palabras
// ("ExpeditionsSection"), para no confundir palabras sueltas del pedido.
const COMPONENT_NAME = /\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+\b/g;

/** Minúsculas y espacios colapsados: "Choose  Your\n Edge" ≈ "choose your edge". */
export function normalizeText(text) {
  return String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Textos entre comillas del pedido ("…", “…”, «…», `…`). */
export function extractQuotedTexts(input) {
  const out = [];
  for (const m of String(input ?? '').matchAll(QUOTED)) {
    const text = (m[1] ?? m[2] ?? m[3] ?? m[4]).trim();
    if (text.length >= 3 && !out.includes(text)) out.push(text);
  }
  return out;
}

/** Archivos seleccionables cuyo contenido contiene el texto (sin mayúsculas ni espacios). */
export function filesContainingText(text, files, isSelectable) {
  const needle = normalizeText(text);
  if (!needle) return [];
  const out = [];
  for (const [path, content] of files) {
    if (isSelectable(path) && normalizeText(content).includes(needle)) out.push(path);
  }
  return out;
}

/** Archivos que el pedido nombra ("ExpeditionsSection.tsx" o "ExpeditionsSection"). */
export function namedFiles(input, files, isSelectable) {
  const text = String(input ?? '');
  const names = new Set();
  for (const m of text.matchAll(FILE_NAME)) names.add(m[0].toLowerCase());
  for (const m of text.matchAll(COMPONENT_NAME)) names.add(m[0].toLowerCase());
  if (names.size === 0) return [];
  const out = [];
  for (const path of files.keys()) {
    if (!isSelectable(path)) continue;
    const base = path.split('/').pop().toLowerCase();
    const stem = base.replace(/\.[^.]+$/, '');
    if (names.has(base) || names.has(stem)) out.push(path);
  }
  return out;
}

/**
 * Archivo decidido por las pistas del usuario, o null si no hay pista única.
 * El texto citado manda (es lo que se ve en pantalla); luego el archivo
 * nombrado. Una pista que apunta a varios archivos no decide nada.
 */
export function resolveHintedTarget(input, files, isSelectable) {
  for (const text of extractQuotedTexts(input)) {
    const matches = filesContainingText(text, files, isSelectable);
    if (matches.length === 1) return { path: matches[0], method: 'quoted-text' };
  }
  const named = namedFiles(input, files, isSelectable);
  if (named.length === 1) return { path: named[0], method: 'named-file' };
  return null;
}

/**
 * Trozo de `size` caracteres para el targeting: alrededor de la primera
 * aparición de algún texto citado; si no aparece, el principio (como antes).
 */
export function snippetForTargeting(content, quotedTexts, size = 1500) {
  const source = String(content ?? '');
  for (const text of quotedTexts ?? []) {
    const words = normalizeText(text).split(' ').filter(Boolean);
    if (words.length === 0) continue;
    // Las palabras en orden con cualquier espacio entre ellas (saltos de línea
    // del JSX incluidos), sin distinguir mayúsculas.
    const pattern = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'i');
    const match = pattern.exec(source);
    if (!match) continue;
    if (match.index + match[0].length <= size) break; // ya se ve desde el principio
    const start = Math.max(0, match.index - Math.floor(size / 3));
    return `…\n${source.slice(start, start + size)}`;
  }
  return source.slice(0, size);
}

// Páginas que no son la web que ve el visitante: van al final de las semillas.
const BACKSTAGE_PAGE = /(admin|dashboard|login|signin|signup|auth|notfound|404)/i;

/**
 * Orden de las semillas para los candidatos `page-imports` (2026-09-30): el
 * Map venía en orden alfabético y `AdminPanel.tsx` llenaba el tope de 8 con
 * componentes del admin antes de llegar a `Index.tsx`. Primero la página de
 * inicio y App.tsx, luego las demás páginas, y al final admin / login / 404.
 */
export function orderPageSeeds(paths) {
  const rank = (p) => {
    if (p === 'src/pages/Index.tsx') return 0;
    if (p === 'src/App.tsx') return 1;
    return BACKSTAGE_PAGE.test(p.split('/').pop() ?? '') ? 3 : 2;
  };
  return [...paths].sort((a, b) => rank(a) - rank(b));
}
