/**
 * projectRoutes — qué páginas tiene el proyecto generado, derivado de los
 * archivos en `src/pages/`.
 *
 * Extraído de `NavigatePanel.tsx` (que ya hacía exactamente esto, sin más
 * fuente de verdad que el nombre de archivo) para que el dropdown de páginas
 * del navbar (StudioEngine, 2026-09-20/21) use la MISMA derivación en vez de
 * reinventar un parser de rutas — no hace falta leer `<Route>` de App.tsx, el
 * nombre de archivo ya es la convención real que usa el generador.
 *
 * `derivePageEntries` (2026-09-21) añade un nombre legible junto a la ruta —
 * el navbar nuevo muestra los dos por separado ("Inicio" / "/"), no sólo la
 * ruta cruda. El nombre es el del archivo, con espacios insertados antes de
 * cada mayúscula ("AboutUs" → "About Us") — no se traduce: el generador
 * escribe nombres de archivo en el idioma que sea, y adivinar una traducción
 * determinista no es posible. "/" es el único caso especial ("Inicio"),
 * porque así lee cualquier usuario esa ruta sin importar el nombre real del
 * archivo (Index.tsx, Home.tsx, etc.)
 */

/** @typedef {{ name: string, route: string }} PageEntry */

function pageFilesFrom(files) {
  const paths = files instanceof Map ? Array.from(files.keys()) : Array.from(files);
  return paths.filter(
    (path) => path.startsWith('src/pages/') && (path.endsWith('.tsx') || path.endsWith('.jsx'))
  );
}

/** "AboutUs" -> "About Us"; ya deja intactos los nombres de una sola palabra. */
function prettifyName(fileBaseName) {
  return fileBaseName.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
}

/**
 * @param {Map<string, string> | Iterable<string>} files
 * @returns {PageEntry[]} Entradas únicas por ruta, "/" siempre primero.
 */
export function derivePageEntries(files) {
  const byRoute = new Map();
  for (const path of pageFilesFrom(files)) {
    const base = path.replace('src/pages/', '').replace(/\.tsx?$/, '').replace(/\.jsx?$/, '');
    const isHome = base === 'Index' || base === 'Home';
    const route = isHome ? '/' : `/${base.toLowerCase()}`;
    const name = isHome ? 'Inicio' : prettifyName(base);
    // Sin duplicados: dos archivos que normalizan a la misma ruta (distinto
    // casing, p.ej. About.tsx y about.tsx) — el primero encontrado gana.
    if (!byRoute.has(route)) byRoute.set(route, { name, route });
  }
  return Array.from(byRoute.values()).sort((a, b) =>
    a.route === '/' ? -1 : b.route === '/' ? 1 : a.route.localeCompare(b.route)
  );
}

/**
 * @param {Map<string, string> | Iterable<string>} files
 * @returns {string[]} Sólo las rutas, ordenadas — para callers que no
 *   necesitan el nombre legible.
 */
export function deriveProjectRoutes(files) {
  return derivePageEntries(files).map((entry) => entry.route);
}
