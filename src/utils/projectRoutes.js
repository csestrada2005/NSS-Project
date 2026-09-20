/**
 * projectRoutes — qué páginas tiene el proyecto generado, derivado de los
 * archivos en `src/pages/`.
 *
 * Extraído de `NavigatePanel.tsx` (que ya hacía exactamente esto, sin más
 * fuente de verdad que el nombre de archivo) para que el dropdown de páginas
 * del navbar nuevo (StudioEngine, 2026-09-20) use la MISMA derivación en vez
 * de reinventar un parser de rutas — no hace falta leer `<Route>` de App.tsx,
 * el nombre de archivo ya es la convención real que usa el generador.
 */

/**
 * @param {Map<string, string> | Iterable<string>} files Rutas de archivo del
 *   proyecto (las claves de `files`, o directamente un iterable de paths).
 * @returns {string[]} Rutas ordenadas, "/" siempre primero si existe.
 */
export function deriveProjectRoutes(files) {
  const paths = files instanceof Map ? Array.from(files.keys()) : Array.from(files);
  const pageFiles = paths.filter(
    (path) => path.startsWith('src/pages/') && (path.endsWith('.tsx') || path.endsWith('.jsx'))
  );

  const routes = pageFiles.map((path) => {
    const name = path.replace('src/pages/', '').replace(/\.tsx?$/, '').replace(/\.jsx?$/, '');
    if (name === 'Index' || name === 'Home') return '/';
    return `/${name.toLowerCase()}`;
  });

  // Sin duplicados (dos páginas que normalizan al mismo nombre en distinto
  // casing, p.ej. About.tsx y about.tsx, no deberían dar dos filas iguales).
  const unique = Array.from(new Set(routes));
  return unique.sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
}
