import * as esbuild from 'esbuild';
import path from 'path';

// Denylist de Node.js builtins (con y sin prefijo "node:"). Son los únicos
// specifiers que el gate rechaza: no existen en el browser y no los puede
// resolver esm.sh. Todo lo demás pasa y se resuelve en compile (ALLOWED_DEPS/
// alias primero, plugin esm.sh como fallback).
const NODE_BUILTINS = new Set([
  'fs', 'path', 'http', 'https', 'net', 'os', 'crypto', 'child_process',
  'stream', 'zlib', 'url', 'util', 'buffer', 'events', 'worker_threads',
  'cluster', 'dns', 'tls', 'dgram'
]);

// Allowlist de deps que el preview puede importar
const ALLOWED_DEPS = {
  'react': 'react-preview',
  'react/jsx-runtime': 'react-preview/jsx-runtime',
  'react-dom': 'react-dom-preview',
  'react-dom/client': 'react-dom-preview/client',
  'react-router-dom': 'react-router-dom-preview',
  'lucide-react': 'lucide-react',
  'clsx': 'clsx',
  'tailwind-merge': 'tailwind-merge',
  'scheduler': 'scheduler',
  'react-router-dom-preview': 'react-router-dom-preview',
  'react-router': 'react-router',
  '@remix-run/router': '@remix-run/router'
};

// Plugin que reescribe react-router-dom para sustituir BrowserRouter/HashRouter por MemoryRouter
// a nivel de import. Necesario porque el preview corre en un iframe sandbox sin allow-same-origin,
// donde window.history.pushState falla. MemoryRouter no toca window.history.
function routerShimPlugin() {
  const SHIM_NAMESPACE = 'router-shim';
  return {
    name: 'router-shim',
    setup(build) {
      // Interceptar cualquier import de 'react-router-dom' antes de que se resuelva al paquete real
      build.onResolve({ filter: /^react-router-dom$/ }, args => {
        return { path: 'react-router-dom-shim', namespace: SHIM_NAMESPACE };
      });

      // Servir el contenido del módulo virtual
      build.onLoad({ filter: /.*/, namespace: SHIM_NAMESPACE }, () => {
        return {
          contents: `
            export * from 'react-router-dom-preview';
            export { MemoryRouter as BrowserRouter, MemoryRouter as HashRouter } from 'react-router-dom-preview';
          `,
          loader: 'js',
          resolveDir: process.cwd()
        };
      });
    }
  };
}

// Plugin de virtual file system: hace que esbuild lea archivos desde el filesObj
function virtualFilesPlugin(files) {
  return {
    name: 'virtual-files',
    setup(build) {
      // Resolver imports relativos (./, ../) y alias @ contra el filesObj
      build.onResolve({ filter: /^[.@]/ }, args => {
        // Los relativos que vienen de dentro de un módulo esm.sh no son archivos
        // del proyecto — deben caer al plugin esm.sh, no al filesystem virtual.
        if (args.namespace === 'esmsh' || (args.importer && args.importer.startsWith('http')))
          return undefined;

        let resolvedPath;

        if (args.path.startsWith('@/')) {
          // Alias @ → src/
          resolvedPath = 'src/' + args.path.slice(2);
        } else if (args.path.startsWith('.')) {
          // Import relativo
          const importerDir = path.posix.dirname(args.importer);
          resolvedPath = path.posix.normalize(path.posix.join(importerDir, args.path));
        } else {
          return null;
        }

        // Probar extensiones
        const candidates = [
          resolvedPath,
          resolvedPath + '.tsx',
          resolvedPath + '.ts',
          resolvedPath + '.jsx',
          resolvedPath + '.js',
          resolvedPath + '.css',
          resolvedPath + '/index.tsx',
          resolvedPath + '/index.ts',
          resolvedPath + '/index.js'
        ];

        for (const candidate of candidates) {
          if (files[candidate]) {
            return { path: candidate, namespace: 'virtual' };
          }
        }

        return {
          errors: [{ text: `Cannot resolve "${args.path}" from "${args.importer}"` }]
        };
      });

      // Cargar contenido desde el filesObj
      build.onLoad({ filter: /.*/, namespace: 'virtual' }, args => {
        const contents = files[args.path];
        if (!contents) {
          return { errors: [{ text: `File not found in virtual FS: ${args.path}` }] };
        }
        const ext = path.posix.extname(args.path);
        let loader = 'tsx';
        if (ext === '.ts') loader = 'ts';
        else if (ext === '.js') loader = 'js';
        else if (ext === '.jsx') loader = 'jsx';
        else if (ext === '.css') loader = 'css';
        return { contents, loader };
      });

      // Gate de deps externas: sólo rechaza Node.js builtins (con o sin prefijo
      // "node:"). El resto pasa y lo resuelve el compile: ALLOWED_DEPS/alias vía
      // build.alias primero, plugin esm.sh como fallback. Si esm.sh no resuelve
      // un paquete, el error de fetch del plugin lo reporta — no hace falta gate.
      build.onResolve({ filter: /^[^.@\/]/ }, args => {
        const rootModule = args.path.replace(/^node:/, '').split('/')[0];
        if (NODE_BUILTINS.has(rootModule)) {
          return {
            errors: [{
              text: `Module "${args.path}" is a Node.js builtin and cannot run in the browser preview.`
            }]
          };
        }
        // null = deja que esbuild siga: build.alias / plugin esm.sh resuelven.
        return null;
      });
    }
  };
}

// Alias map de esbuild: redirige los bare imports a las builds locales (preview)
// para garantizar una sola instancia de React/router en todo el bundle.
const ALIAS = {
  'react': new URL('../node_modules/react-preview/cjs/react.development.js', import.meta.url).pathname,
  'react-dom': new URL('../node_modules/react-dom-preview/cjs/react-dom.development.js', import.meta.url).pathname,
  'react-dom/client': new URL('../node_modules/react-dom-preview/cjs/react-dom.development.js', import.meta.url).pathname,
  'react/jsx-runtime': new URL('../node_modules/react-preview/cjs/react-jsx-runtime.development.js', import.meta.url).pathname,
  'scheduler': new URL('../node_modules/react-dom-preview/node_modules/scheduler/cjs/scheduler.development.js', import.meta.url).pathname,
  'react-router-dom-preview': new URL('../node_modules/react-router-dom-preview/dist/react-router-dom.development.js', import.meta.url).pathname,
  'react-router': new URL('../node_modules/react-router-dom-preview/node_modules/react-router/dist/react-router.development.js', import.meta.url).pathname,
  '@remix-run/router': new URL('../node_modules/@remix-run/router/dist/router.cjs.js', import.meta.url).pathname
};

// Base URL del CDN, configurable vía env para tests / mirrors
const ESM_BASE = process.env.ESM_CDN_BASE || 'https://esm.sh';

// Caché module-level keyed por URL. El preview recompila en cada keystroke;
// sin caché re-fetcheamos lo mismo una y otra vez y pegamos rate limits.
const esmShCache = new Map();

// Fallback CDN del runtime híbrido: resuelve cualquier bare import de npm que NO
// esté en el alias map ni sea archivo del proyecto, fetcheándolo desde esm.sh en
// compile-time. Debe ir DESPUÉS de virtualFilesPlugin para que los archivos del
// proyecto y el alias ganen la resolución primero.
function esmShResolverPlugin() {
  // Deps que SIEMPRE las maneja el alias local. Nunca deben ir a esm.sh: así
  // garantizamos una sola instancia de React en todo el bundle. Se construye a
  // partir del alias map para que cualquier módulo aliaseado (incluido
  // react-router-dom-preview, @remix-run/router, etc.) quede cubierto.
  const LOCAL_MODULES = new Set([...Object.keys(ALIAS), 'react-router-dom']);

  // true si p es un módulo local exacto o un subpath de uno (name + '/...').
  // El prefix-match evita que subpaths como 'lucide-react/…' o
  // 'react-dom/client-like' se fuguen al CDN.
  const isLocalModule = (p) => {
    if (LOCAL_MODULES.has(p)) return true;
    for (const name of LOCAL_MODULES) {
      if (p.startsWith(name + '/')) return true;
    }
    return false;
  };

  return {
    name: 'esm-sh-resolver',
    setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        // Módulos locales (alias map) y cualquier *-preview → nunca a esm.sh.
        // Va PRIMERO, gana a TODO (incluso a imports que vienen de dentro de un
        // módulo esm.sh), para que p.ej. 'react' importado por lucide-react
        // resuelva al React local: una sola instancia de React en el bundle.
        if (isLocalModule(args.path) || args.path.endsWith('-preview')) {
          return undefined;
        }

        // Relativos y alias del proyecto → los maneja virtualFilesPlugin / alias
        if (args.path === '.' || args.path.startsWith('src/') || args.path.startsWith('@/')) {
          return undefined;
        }

        // Import transitivo desde dentro de un módulo esm.sh: resolver contra el importer
        if (args.namespace === 'esmsh' || (args.importer && args.importer.startsWith('http'))) {
          return { path: new URL(args.path, args.importer).href, namespace: 'esmsh' };
        }

        // Cualquier otro bare specifier → esm.sh.
        // ?external es CRÍTICO: evita que esm.sh bundlee su propia copia de React.
        console.warn('[compiler] CDN fallback:', args.path, '| importer:',
          args.importer || 'n/a', '| namespace:', args.namespace || 'n/a');
        const url = `${ESM_BASE}/${args.path}?external=react,react-dom,react-router-dom`;
        return { path: url, namespace: 'esmsh' };
      });

      // onResolve ADICIONAL scoped al namespace esmsh: resuelve los imports que
      // surgen de DENTRO de un módulo esm.sh (paquetes multi-módulo como
      // framer-motion). Los relativos/absolutos deben resolverse contra el módulo
      // importador, no contra el filesystem virtual del proyecto.
      build.onResolve({ filter: /.*/, namespace: 'esmsh' }, args => {
        // Bare imports externalizados (react, react-dom...) → alias local.
        if (isLocalModule(args.path) || args.path.endsWith('-preview')) return undefined;
        // Relativos y absolutos → resolver contra el módulo importador.
        if (args.path.startsWith('.') || args.path.startsWith('/'))
          return { path: new URL(args.path, args.importer).href, namespace: 'esmsh' };
        // Bare specifiers nuevos importados por un módulo CDN → esm.sh con external.
        return { path: `${ESM_BASE}/${args.path}?external=react,react-dom,react-router-dom`, namespace: 'esmsh' };
      });

      build.onLoad({ filter: /.*/, namespace: 'esmsh' }, async args => {
        if (esmShCache.has(args.path)) {
          return esmShCache.get(args.path);
        }

        const res = await fetch(args.path);
        if (!res.ok) {
          return { errors: [{ text: `esm.sh fetch ${res.status}: ${args.path}` }] };
        }

        const result = { contents: await res.text(), loader: 'js' };
        esmShCache.set(args.path, result);
        return result;
      });
    }
  };
}

const PREVIEW_CLIENT_SCRIPT = `
(function() {
  console.log('Preview Client Active');
  let currentMode = 'interaction';
  let hoverRafId = null;

  function getLayoutContext(element) {
    const computedStyle = window.getComputedStyle(element);
    const parentComputedStyle = element.parentElement ? window.getComputedStyle(element.parentElement) : {};
    return {
      display: computedStyle.display,
      position: computedStyle.position,
      parentDisplay: parentComputedStyle.display || '',
      parentPosition: parentComputedStyle.position || '',
      offsetTop: element.offsetTop,
      offsetLeft: element.offsetLeft,
      offsetWidth: element.offsetWidth,
      offsetHeight: element.offsetHeight
    };
  }

  window.addEventListener('message', (event) => {
    if (event.data.type === 'set-mode') { currentMode = event.data.mode; }
    else if (event.data.type === 'navigate') {
      window.history.pushState({}, '', event.data.path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });

  window.addEventListener('mouseover', (event) => {
    if (currentMode === 'visual' && event.target) {
      if (hoverRafId) cancelAnimationFrame(hoverRafId);
      hoverRafId = requestAnimationFrame(() => {
        const rect = event.target.getBoundingClientRect();
        window.parent.postMessage({
          type: 'element-hovered',
          tagName: event.target.tagName,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        }, '*');
      });
    }
  }, true);

  window.addEventListener('click', (event) => {
    if (currentMode === 'visual' && event.target) {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.target.getBoundingClientRect();
      window.parent.postMessage({
        type: 'element-clicked',
        tagName: event.target.tagName,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        layoutContext: getLayoutContext(event.target)
      }, '*');
    }
  }, true);

  window.addEventListener('error', (event) => {
    window.parent.postMessage({
      type: 'preview-error',
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    }, '*');
  });

  window.addEventListener('unhandledrejection', (event) => {
    window.parent.postMessage({
      type: 'preview-error',
      message: 'Unhandled promise rejection: ' + (event.reason?.message || event.reason),
      stack: event.reason?.stack
    }, '*');
  });
})();
`;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function generateHTML(bundleCode, cssCode) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/vendor/tailwind-base.css">
  <script src="/vendor/tailwindcss-browser.js"></script>
  <style>body{margin:0;}#root{min-height:100vh;}${cssCode || ''}</style>
</head>
<body>
  <div id="root"></div>
  <script>
${bundleCode}
  </script>
  <script>
${PREVIEW_CLIENT_SCRIPT}
  </script>
</body>
</html>`;
}

function generateErrorHTML(message, details) {
  const safeMessage = escapeHtml(message || 'Unknown compile error');
  const safeDetails = escapeHtml(JSON.stringify(details || {}, null, 2));
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { background:#1a0000; color:#ff8888; font-family:monospace; padding:20px; margin:0; }
pre { white-space: pre-wrap; word-break: break-word; }
</style></head><body>
<h2>Compile Error</h2>
<p>${safeMessage}</p>
<pre>${safeDetails}</pre>
</body></html>`;
}

export async function compileFiles(filesObj) {
  if (!filesObj || typeof filesObj !== 'object') {
    return { error: 'filesObj must be an object', errorDetails: null };
  }

  // Determinar entrypoint: prefer src/main.tsx, fallback a src/index.tsx
  const entryCandidates = ['src/main.tsx', 'src/main.ts', 'src/index.tsx', 'src/index.ts'];
  const entry = entryCandidates.find(c => filesObj[c]);
  if (!entry) {
    return {
      error: 'No entrypoint found. Expected one of: ' + entryCandidates.join(', '),
      errorDetails: { filesProvided: Object.keys(filesObj) }
    };
  }

  try {
    const result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      outdir: 'dist',
      format: 'iife',
      target: ['es2020'],
      jsx: 'automatic',
      jsxImportSource: 'react',
      loader: { '.tsx': 'tsx', '.ts': 'ts', '.jsx': 'jsx', '.js': 'js', '.css': 'css' },
      mainFields: ['module', 'main'],
      conditions: ['development', 'module', 'browser', 'default'],
      resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.css', '.json'],
      define: {
        'process.env.NODE_ENV': '"development"',
        'global': 'window'
      },
      alias: ALIAS,
      banner: {
        js: '// Wyrd Forge preview bundle\n;(function(){var __originalBrowserRouter;'
      },
      footer: {
        js: '})();'
      },
      plugins: [routerShimPlugin(), virtualFilesPlugin(filesObj), esmShResolverPlugin()],
      logLevel: 'silent'
    });

    let bundleJs = '';
    let bundleCss = '';
    for (const out of result.outputFiles) {
      if (out.path.endsWith('.css')) {
        bundleCss += out.text;
      } else {
        bundleJs += out.text;
      }
    }

    const html = generateHTML(bundleJs, bundleCss);
    return { html };

  } catch (err) {
    const errors = err.errors || [];
    const warnings = err.warnings || [];

    // esbuild entrega cada error como un Message con { text, location }, donde
    // location = { file, line, column, lineText, ... }. El auto-fix del Verifier
    // necesita el archivo/línea exactos; aplanar a string los pierde. Extraemos
    // del primer error un errorDetail estructurado, quitando el prefijo del
    // namespace virtual del path ("virtual:src/App.tsx" → "src/App.tsx") para
    // que coincida con las keys del filesObj del proyecto.
    const first = errors[0];
    const loc = first?.location;
    const errorDetail = first
      ? {
          message: first.text ?? null,
          file: loc?.file ? loc.file.replace(/^virtual:/, '') : null,
          line: loc?.line ?? null,
          lineText: loc?.lineText ?? null
        }
      : null;

    return {
      error: errors[0]?.text || err.message || 'esbuild compilation failed',
      errorDetails: { errors, warnings, message: err.message },
      errorDetail
    };
  }
}
