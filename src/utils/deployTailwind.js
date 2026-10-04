// ---------------------------------------------------------------------------
// deployTailwind — el sitio PUBLICADO se construye con el mismo motor de
// estilos que el PREVIEW (2026-10-05, decisión de Samuel: "los proyectos se
// tienen que ver como en el preview").
//
// El preview pinta con Tailwind 4 (hoja precompilada + motor en el navegador),
// sin `tailwind.config.js`, y con el `index.css` del proyecto tal cual — el
// navegador ignora `@tailwind …` y `@apply …`. El paquete que va a Vercel traía
// Tailwind 3 + config + postcss: otro motor, otro resultado (bordes, rings,
// sombras, espaciado, colores de la config). Aquí se ajusta SÓLO ese paquete:
//   - package.json: tailwindcss 4 + @tailwindcss/postcss (misma versión que el
//     motor del preview);
//   - postcss.config.js: el plugin de Tailwind 4;
//   - src/index.css: `@import "tailwindcss";` en lugar de las directivas de la
//     v3, y sin las líneas `@apply` (el preview no las aplica; Tailwind 4 sin
//     config fallaría con `border-border` y similares).
// El proyecto que se edita no se toca.
// ---------------------------------------------------------------------------

/** Versión del motor que usa el preview (public/vendor/tailwindcss-browser.js). */
export const PREVIEW_TAILWIND_VERSION = '4.3.3';

export const TAILWIND_V4_POSTCSS = `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
`;

/** index.css de un proyecto (Tailwind 3) → equivalente a lo que pinta el preview con Tailwind 4. */
export function toTailwindV4Css(css) {
  const body = String(css ?? '')
    .replace(/^[ \t]*@tailwind\s+(base|components|utilities|variants|screens)\s*;[ \t]*\r?\n?/gim, '')
    .replace(/^[ \t]*@apply\s+[^;{}]*;[ \t]*\r?\n?/gim, '')
    .replace(/^[ \t]*@import\s+["']tailwindcss["']\s*;[ \t]*\r?\n?/gim, '');
  return `@import "tailwindcss";\n${body.replace(/^\s*\n/, '')}`;
}

/** package.json → Tailwind 4 para el build; si no se puede leer, se deja igual. */
export function toTailwindV4PackageJson(raw) {
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!pkg || typeof pkg !== 'object') return raw;
  const dev = { ...(pkg.devDependencies ?? {}) };
  const deps = { ...(pkg.dependencies ?? {}) };
  delete deps.tailwindcss;
  delete deps['@tailwindcss/postcss'];
  dev.tailwindcss = PREVIEW_TAILWIND_VERSION;
  dev['@tailwindcss/postcss'] = PREVIEW_TAILWIND_VERSION;
  if (!dev.postcss && !deps.postcss) dev.postcss = '^8.4.47';
  return `${JSON.stringify({ ...pkg, dependencies: deps, devDependencies: dev }, null, 2)}\n`;
}

/**
 * @param {Record<string, string> | null | undefined} files paquete a publicar
 * @returns copia con el build de estilos igual al del preview (o `files` si no es un proyecto Vite+Tailwind)
 */
export function withPreviewTailwindBuild(files) {
  if (!files || typeof files !== 'object') return files;
  if (typeof files['package.json'] !== 'string' || typeof files['src/index.css'] !== 'string') return files;
  return {
    ...files,
    'package.json': toTailwindV4PackageJson(files['package.json']),
    'postcss.config.js': TAILWIND_V4_POSTCSS,
    'src/index.css': toTailwindV4Css(files['src/index.css']),
  };
}

const FONT_LINK = /<link\b[^>]*href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"']*["'][^>]*>/gi;

/**
 * Los <link> de fuentes del index.html del proyecto (preconnect + hoja de
 * Google Fonts) para el <head> del PREVIEW, que arma su propia página y no
 * los cargaba: el publicado mostraba las fuentes del DESIGN.md y el preview no.
 */
export function fontLinksFromIndexHtml(html) {
  return [...String(html ?? '').matchAll(FONT_LINK)].map((m) => m[0]).join('\n');
}
