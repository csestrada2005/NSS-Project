/**
 * compilerPerfHarness.mjs — cuenta cuántas veces cruza cada onResolve/onLoad
 * el puente Go<->Node durante un esbuild.build equivalente al de
 * compileFiles(), cuánto tiempo consume cada uno, el tamaño del grafo
 * resultante (metafile) y cómo cambian ambas cosas al aislar cada dependencia
 * externa y al escalar el número de archivos del proyecto. SOLO MEDICIÓN: no
 * toca server/compiler.js, no crea rama, no hace commit, no abre PR.
 *
 * ---------------------------------------------------------------------------
 * QUÉ ES REAL Y QUÉ ESTÁ COPIADO
 * ---------------------------------------------------------------------------
 * REAL (import directo desde server/compiler.js, exportado ahí):
 *   - instrumentSource, fileSlugFor (usados por el onLoad de virtualFiles)
 *
 * COPIADO — ADVERTENCIA DE SINCRONIZACIÓN (léase antes de usar este harness):
 * NODE_BUILTINS, ALIAS, routerShimPlugin, virtualFilesPlugin y
 * esmShResolverPlugin de este archivo SON COPIAS LOCALES, NO IMPORTS, de
 * los símbolos homónimos de server/compiler.js — ese archivo no los exporta
 * y está prohibido modificarlo para hacerlo. Cada copia lleva anotada, junto
 * a su definición, la línea de inicio y fin de server/compiler.js (commit
 * ba3a726) de la que se copió (ver lista debajo). Estas copias NO se
 * actualizan solas: si server/compiler.js cambia esas líneas después de
 * este commit, hay que RE-SINCRONIZAR A MANO cada copia de este archivo con
 * el server/compiler.js vigente ANTES de volver a correr el harness — si no
 * se hace, la medición que produzca será la de código YA OBSOLETO, no la
 * del compilador real.
 *
 * Símbolos copiados, cada uno con un comentario que dice de qué líneas de
 * server/compiler.js (commit ba3a726) viene:
 *   - NODE_BUILTINS         ← compiler.js:110-113
 *   - routerShimPlugin      ← compiler.js:144-215
 *   - virtualFilesPlugin    ← compiler.js:220-375 (con la instrumentación de
 *                              fs.statSync y el desglose guarda/filesObj del
 *                              requisito 4 añadidos explícitamente — señalado
 *                              inline con "INSTRUMENTACIÓN")
 *   - ALIAS                 ← compiler.js:379-420 (las rutas relativas
 *                              '../node_modules/...' siguen resolviendo al
 *                              mismo node_modules/ de la raíz: scripts/ y
 *                              server/ están al mismo nivel bajo la raíz),
 *                              MÁS DOS ENTRADAS EXTRA sólo-harness (ver
 *                              bloque "ALIAS_EXTRA_SOLO_HARNESS" abajo — no
 *                              existen en compiler.js:379-420)
 *   - esmShResolverPlugin   ← compiler.js:433-536
 * La lógica de resolución/carga interna de estas copias no se toca salvo la
 * instrumentación explícita del requisito 4. El conteo de invocaciones y
 * tiempos de los seis puntos (R150/R225/R345/L309/R463/R494) se hace DESDE
 * FUERA, envolviendo el objeto `build` que cada plugin.setup() recibe.
 *
 * ---------------------------------------------------------------------------
 * CORRECCIÓN v2 — por qué v1 terminaba en errors
 * ---------------------------------------------------------------------------
 * @supabase/auth-js, @supabase/functions-js y @supabase/storage-js importan,
 * por bare specifier, 'tslib' e 'iceberg-js' respectivamente — dos paquetes
 * que el ALIAS real de compiler.js NO vendoriza (el propio comentario de
 * compiler.js:412-413 lo dice: son los únicos que siguen resolviendo por
 * esm.sh). En v1 esmShResolverPlugin los mandaba a red, el entorno no tiene
 * salida a esm.sh, la petición fallaba con 403 y esbuild.build() rechazaba
 * ANTES de terminar la fase de enlace/tree-shaking/codegen — justo lo que
 * había que medir.
 * PASO 0 (verificado antes de tocar el harness): ambos paquetes SÍ están
 * instalados en node_modules/ (node_modules/tslib/package.json y
 * node_modules/iceberg-js/package.json existen). Por eso la corrección es
 * añadir sus entries ESM al ALIAS local de ESTE archivo — nunca a
 * server/compiler.js — para que esbuild los resuelva en disco igual que el
 * resto de paquetes vendorizados, sin salir nunca a red. Ver
 * ALIAS_EXTRA_SOLO_HARNESS más abajo.
 *
 * SIN RED, SIN DB, SIN CREDENCIALES:
 *   - dbCredentials = null (igual que compileFiles sin credenciales)
 *   - todo filesObj usado aquí es 100% sintético, en memoria, no pertenece a
 *     ningún proyecto real
 *   - con ALIAS_EXTRA_SOLO_HARNESS puesto, ningún paquete que toca el árbol
 *     de imports de los escenarios de abajo debería salir a esm.sh. fetch()
 *     sigue envuelto por si acaso (requisito 6): cuenta intentos y, si la red
 *     falla, captura el error y deja seguir el build en vez de tumbarlo.
 *
 * result.errors.length se reporta en CADA corrida (PASO 0 lo exige): si no
 * es 0 la medición de esa corrida no vale y se marca explícitamente como tal
 * en la salida, sin promediarla con las demás.
 *
 * ---------------------------------------------------------------------------
 * AMPLIACIÓN v3 — bytes de salida, pre-empaquetado de vendor, E7-E9
 * ---------------------------------------------------------------------------
 *   - Cada corrida (BASELINE y E1-E9) suma ahora bytes reales de JS y de CSS
 *     de result.outputFiles (write:false se mantiene igual que
 *     compiler.js:855; sólo se agregan los bytes que esbuild ya devuelve).
 *   - prebundlePackage() corre, UNA SOLA VEZ y fuera del cronómetro de
 *     cualquier escenario, un esbuild.build previo (bundle:true, format:esm,
 *     splitting:false, minify:false, write:true) sobre el entry actual de
 *     ALIAS['lucide-react'] / ALIAS['framer-motion'], produciendo un único
 *     .mjs por paquete en un directorio temporal (borrado al final de
 *     main()).
 *   - E7/E8/E9 reusan el filesObj de E1/E6 pero con una COPIA de ALIAS cuyas
 *     entradas lucide-react/framer-motion apuntan a esos .mjs
 *     pre-empaquetados en vez de a node_modules/ — runBuild() acepta ahora
 *     un `alias` opcional para esto; el ALIAS base (con
 *     ALIAS_EXTRA_SOLO_HARNESS) no se modifica.
 *
 * ---------------------------------------------------------------------------
 * AMPLIACIÓN v4 — E10/E11 (pure: ['createLucideIcon']) y E12 (framer solo)
 * ---------------------------------------------------------------------------
 *   - prebundlePackage() acepta ahora un `extraOptions` opcional que se
 *     spreadea sobre las opciones del esbuild.build previo (para poder pasar
 *     pure:['createLucideIcon'] SOLO al pre-empaquetado de lucide-react de
 *     E10/E11, sin tocar el pre-empaquetado ya existente que usan E7-E9).
 *   - runBuild() acepta un tercer parámetro opcional `options` con
 *     `extraBuildOptions` (spreadeado sobre las opciones del build
 *     CONSUMIDOR — usado por E11 para añadir pure:['createLucideIcon'] ahí
 *     también) y `checkIconNames` (array de nombres a buscar en el texto de
 *     los outputFiles JS resultantes — usado por E10/E11 para el criterio de
 *     verificación obligatorio de Heart/Star/Menu).
 *   - E10 reusa filesObj de E1 con ALIAS['lucide-react'] apuntando a un
 *     pre-empaquetado NUEVO (pure:['createLucideIcon'] en el build de
 *     pre-empaquetado); framer-motion se deja EXACTAMENTE como ALIAS base
 *     (node_modules, sin pre-empaquetar).
 *   - E11 es igual que E10 pero además pasa pure:['createLucideIcon'] al
 *     build CONSUMIDOR (extraBuildOptions), para descartar cuál de los dos
 *     sitios es el correcto.
 *   - E12 reusa filesObj de E1 con SOLO ALIAS['framer-motion'] apuntando al
 *     pre-empaquetado ya existente (el mismo que usa E7-E9); lucide-react se
 *     deja EXACTAMENTE como ALIAS base (node_modules, tal cual hoy).
 *
 * EJECUCIÓN:  node scripts/compilerPerfHarness.mjs
 */

import * as esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { instrumentSource, fileSlugFor } from '../server/compiler.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

// ===========================================================================
// COPIA — compiler.js:110-113 (denylist de Node.js builtins)
// ===========================================================================
const NODE_BUILTINS = new Set([
  'fs', 'path', 'http', 'https', 'net', 'os', 'crypto', 'child_process',
  'stream', 'zlib', 'url', 'util', 'buffer', 'events', 'worker_threads',
  'cluster', 'dns', 'tls', 'dgram'
]);

// ===========================================================================
// COPIA — compiler.js:144-215 (routerShimPlugin), sin cambios
// ===========================================================================
function routerShimPlugin() {
  const SHIM_NAMESPACE = 'router-shim';
  return {
    name: 'router-shim',
    setup(build) {
      build.onResolve({ filter: /^react-router-dom$/ }, args => {
        return { path: 'react-router-dom-shim', namespace: SHIM_NAMESPACE };
      });
      build.onLoad({ filter: /.*/, namespace: SHIM_NAMESPACE }, () => {
        return {
          contents: `
            import React from 'react';
            import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom-preview';
            export * from 'react-router-dom-preview';
            function NavigationBridge() {
              const navigate = useNavigate();
              const location = useLocation();
              React.useEffect(() => {
                window.__forgeNavigate = navigate;
                const onMessage = (e) => {
                  if (e.data?.type === 'navigate' && typeof e.data.path === 'string') {
                    navigate(e.data.path);
                  }
                };
                window.addEventListener('message', onMessage);
                return () => window.removeEventListener('message', onMessage);
              }, [navigate]);
              React.useEffect(() => {
                window.parent.postMessage({ type: 'route-changed', path: location.pathname }, '*');
              }, [location.pathname]);
              return null;
            }
            export function BrowserRouter({ children, ...props }) {
              return React.createElement(
                MemoryRouter,
                props,
                React.createElement(NavigationBridge),
                children
              );
            }
            export function HashRouter({ children, ...props }) {
              return React.createElement(
                MemoryRouter,
                props,
                React.createElement(NavigationBridge),
                children
              );
            }
          `,
          loader: 'js',
          resolveDir: process.cwd()
        };
      });
    }
  };
}

// ===========================================================================
// INSTRUMENTACIÓN requisito 4 — desglose guarda/filesObj y contador de
// fs.statSync dentro del onResolve de virtualFilesPlugin (línea 225 original).
// Se resetea al arrancar cada una de las 3 corridas (ver runOnce()).
// ===========================================================================
let vfs225Guard = 0;
let vfs225FilesObj = 0;
let vfsStatSyncCalls = 0;
let vfsStatSyncMs = 0;

function countedStatSync(p) {
  const t0 = performance.now();
  try {
    return fs.statSync(p);
  } finally {
    vfsStatSyncCalls += 1;
    vfsStatSyncMs += performance.now() - t0;
  }
}

// ===========================================================================
// COPIA — compiler.js:220-375 (virtualFilesPlugin), lógica intacta salvo las
// dos líneas marcadas "INSTRUMENTACIÓN" (contadores de rama + statSync
// contado en vez de fs.statSync directo).
// ===========================================================================
function virtualFilesPlugin(files, oidMap) {
  return {
    name: 'virtual-files',
    setup(build) {
      build.onResolve({ filter: /^[.@]/ }, args => {
        if (args.namespace === 'esmsh' || (args.importer && args.importer.startsWith('http')))
          return undefined;

        if (args.path.startsWith('.') && args.namespace === 'file' && args.importer && path.isAbsolute(args.importer)) {
          vfs225Guard += 1; // INSTRUMENTACIÓN requisito 4
          const resolved = path.resolve(path.dirname(args.importer), args.path);
          const candidates = [resolved, resolved + '.js', resolved + '.mjs', resolved + '.cjs',
            resolved + '/index.js', resolved + '/index.mjs'];
          const match = candidates.find(c => {
            try { return countedStatSync(c).isFile(); } catch { return false; } // INSTRUMENTACIÓN requisito 4
          });
          return { path: match || resolved, sideEffects: false };
        }

        vfs225FilesObj += 1; // INSTRUMENTACIÓN requisito 4
        let resolvedPath;

        if (args.path.startsWith('@/')) {
          resolvedPath = 'src/' + args.path.slice(2);
        } else if (args.path.startsWith('.')) {
          const importerDir = path.posix.dirname(args.importer);
          resolvedPath = path.posix.normalize(path.posix.join(importerDir, args.path));
        } else {
          return null;
        }

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

      build.onLoad({ filter: /.*/, namespace: 'virtual' }, args => {
        const rawContents = files[args.path];
        if (!rawContents) {
          return { errors: [{ text: `File not found in virtual FS: ${args.path}` }] };
        }
        const ext = path.posix.extname(args.path);
        let loader = 'tsx';
        if (ext === '.ts') loader = 'ts';
        else if (ext === '.js') loader = 'js';
        else if (ext === '.jsx') loader = 'jsx';
        else if (ext === '.css') loader = 'css';

        let contents = rawContents;
        if (ext === '.tsx' || ext === '.jsx') {
          const slug = fileSlugFor(args.path);
          try {
            const { code, count } = instrumentSource(rawContents, slug);
            contents = code;
            if (count > 0 && oidMap) oidMap[slug] = args.path;
          } catch (err) {
            console.warn('[compiler] data-oid instrumentation skipped for',
              args.path, '—', err && err.message ? err.message : err);
          }
        }
        return { contents, loader };
      });

      build.onResolve({ filter: /^[^.@\/]/ }, args => {
        if (/^https?:\/\//.test(args.path) &&
            args.namespace !== 'esmsh' &&
            !(args.importer && args.importer.startsWith('http'))) {
          return {
            errors: [{
              text: 'URL imports are not supported. Fonts are already loaded in index.html; npm packages must be imported by name.'
            }]
          };
        }
        const rootModule = args.path.replace(/^node:/, '').split('/')[0];
        if (NODE_BUILTINS.has(rootModule)) {
          return {
            errors: [{
              text: `Module "${args.path}" is a Node.js builtin and cannot run in the browser preview.`
            }]
          };
        }
        return null;
      });
    }
  };
}

// ===========================================================================
// COPIA — compiler.js:379-420 (ALIAS), sin cambios. '../node_modules/...' es
// relativo a ESTE archivo (scripts/compilerPerfHarness.mjs); como scripts/ y
// server/ están ambos un nivel bajo la raíz, sigue apuntando exactamente al
// mismo node_modules/ que usa compiler.js.
// ===========================================================================
const ALIAS = {
  'react': new URL('../node_modules/react-preview/cjs/react.development.js', import.meta.url).pathname,
  'react-dom': new URL('../node_modules/react-dom-preview/cjs/react-dom.development.js', import.meta.url).pathname,
  'react-dom/client': new URL('../node_modules/react-dom-preview/cjs/react-dom.development.js', import.meta.url).pathname,
  'react/jsx-runtime': new URL('../node_modules/react-preview/cjs/react-jsx-runtime.development.js', import.meta.url).pathname,
  'scheduler': new URL('../node_modules/react-dom-preview/node_modules/scheduler/cjs/scheduler.development.js', import.meta.url).pathname,
  'react-router-dom-preview': new URL('../node_modules/react-router-dom-preview/dist/react-router-dom.development.js', import.meta.url).pathname,
  'react-router': new URL('../node_modules/react-router-dom-preview/node_modules/react-router/dist/react-router.development.js', import.meta.url).pathname,
  '@remix-run/router': new URL('../node_modules/@remix-run/router/dist/router.cjs.js', import.meta.url).pathname,
  'lucide-react': new URL('../node_modules/lucide-react/dist/esm/lucide-react.js', import.meta.url).pathname,
  'framer-motion': new URL('../node_modules/framer-motion/dist/es/index.mjs', import.meta.url).pathname,
  'motion-dom': new URL('../node_modules/motion-dom/dist/es/index.mjs', import.meta.url).pathname,
  'motion-utils': new URL('../node_modules/motion-utils/dist/es/index.mjs', import.meta.url).pathname,
  'clsx': new URL('../node_modules/clsx/dist/clsx.mjs', import.meta.url).pathname,
  'tailwind-merge': new URL('../node_modules/tailwind-merge/dist/bundle-mjs.mjs', import.meta.url).pathname,
  '@supabase/supabase-js': new URL('../node_modules/@supabase/supabase-js/dist/index.mjs', import.meta.url).pathname,
  '@supabase/auth-js': new URL('../node_modules/@supabase/auth-js/dist/module/index.js', import.meta.url).pathname,
  '@supabase/postgrest-js': new URL('../node_modules/@supabase/postgrest-js/dist/index.mjs', import.meta.url).pathname,
  '@supabase/realtime-js': new URL('../node_modules/@supabase/realtime-js/dist/module/index.js', import.meta.url).pathname,
  '@supabase/storage-js': new URL('../node_modules/@supabase/storage-js/dist/index.mjs', import.meta.url).pathname,
  '@supabase/functions-js': new URL('../node_modules/@supabase/functions-js/dist/module/index.js', import.meta.url).pathname,

  // ---------------------------------------------------------------------
  // ALIAS_EXTRA_SOLO_HARNESS — NO existen en compiler.js:379-420. Se añaden
  // ÚNICAMENTE en esta copia local para que el build offline del harness
  // termine con result.errors.length === 0 (requisito PASO 0). tslib e
  // iceberg-js son los dos paquetes que, según el propio comentario de
  // compiler.js:412-413, NO están vendorizados en el ALIAS real y siguen
  // resolviendo por esm.sh — auth-js/functions-js importan 'tslib',
  // storage-js importa 'iceberg-js'. Entries verificadas contra el campo
  // "module"/"exports" de cada package.json (PASO 0):
  //   tslib/package.json        → exports['.'].module = './tslib.es6.mjs'
  //   iceberg-js/package.json   → exports['.'].import  = './dist/index.mjs'
  'tslib': new URL('../node_modules/tslib/tslib.es6.mjs', import.meta.url).pathname,
  'iceberg-js': new URL('../node_modules/iceberg-js/dist/index.mjs', import.meta.url).pathname,
};

const ESM_BASE = process.env.ESM_CDN_BASE || 'https://esm.sh';
const esmShCache = new Map();

// ===========================================================================
// COPIA — compiler.js:433-536 (esmShResolverPlugin), sin cambios
// ===========================================================================
function esmShResolverPlugin() {
  const LOCAL_MODULES = new Set([...Object.keys(ALIAS), 'react-router-dom']);

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
      let cdnFetchCount = 0;
      let cdnFetchTotalMs = 0;

      build.onResolve({ filter: /.*/ }, args => {
        if (isLocalModule(args.path) || args.path.endsWith('-preview')) {
          return undefined;
        }
        if (args.path === '.' || args.path.startsWith('src/') || args.path.startsWith('@/')) {
          return undefined;
        }
        if (args.namespace === 'esmsh' || (args.importer && args.importer.startsWith('http'))) {
          return { path: new URL(args.path, args.importer).href, namespace: 'esmsh' };
        }
        console.warn('[compiler] CDN fallback:', args.path, '| importer:',
          args.importer || 'n/a', '| namespace:', args.namespace || 'n/a');
        const url = `${ESM_BASE}/${args.path}?external=react,react-dom,react-router-dom`;
        return { path: url, namespace: 'esmsh' };
      });

      build.onResolve({ filter: /.*/, namespace: 'esmsh' }, args => {
        if (isLocalModule(args.path) || args.path.endsWith('-preview')) return undefined;
        if (args.path.startsWith('.') || args.path.startsWith('/'))
          return { path: new URL(args.path, args.importer).href, namespace: 'esmsh' };
        return { path: `${ESM_BASE}/${args.path}?external=react,react-dom,react-router-dom`, namespace: 'esmsh' };
      });

      build.onLoad({ filter: /.*/, namespace: 'esmsh' }, async args => {
        if (esmShCache.has(args.path)) {
          return esmShCache.get(args.path);
        }
        const fetchStart = Date.now();
        const res = await fetch(args.path);
        const fetchMs = Date.now() - fetchStart;
        cdnFetchCount += 1;
        cdnFetchTotalMs += fetchMs;
        console.log(`[compile] CDN fetch: ${args.path} ${fetchMs}ms`);
        if (!res.ok) {
          return { errors: [{ text: `esm.sh fetch ${res.status}: ${args.path}` }] };
        }
        const result = { contents: await res.text(), loader: 'js' };
        esmShCache.set(args.path, result);
        return result;
      });

      build.onEnd(() => {
        console.log(`[compile] CDN fetches: ${cdnFetchCount}, total ${cdnFetchTotalMs}ms`);
      });
    }
  };
}

// ===========================================================================
// requisito 6 — fetch() envuelto: cuenta intentos hacia esm.sh y, si la red
// falla, devuelve un Response sintético con ok:false en vez de dejar que la
// excepción tumbe todo el build. No hay llamadas reales de red esperadas
// (los únicos paquetes del filesObj sintético están todos en ALIAS), pero
// esto cubre el caso de que alguna igual llegue a esmShResolverPlugin.
// ===========================================================================
let fetchAttempts = 0;
const realFetch = globalThis.fetch;
function countingFetch(url, ...rest) {
  fetchAttempts += 1;
  return realFetch(url, ...rest).catch(err => {
    console.warn('[harness] fetch a esm.sh falló, se captura y se sigue:', String(err));
    return { ok: false, status: 0, text: async () => '' };
  });
}

// ===========================================================================
// requisito 3 — decorador genérico: envuelve build.onResolve/build.onLoad
// DESDE FUERA del plugin, sin tocar su lógica interna. `resolveIds`/`loadIds`
// asignan un id (o null para "no medido") a cada llamada de registro, EN EL
// ORDEN en que el plugin.setup() original las hace.
// ===========================================================================
const pointStats = new Map();     // id -> { count, ms }
const pointImporters = new Map(); // id -> Map(importer -> count)

function resetPointStats() {
  pointStats.clear();
  pointImporters.clear();
}

function recordHit(id, ms, importer) {
  const s = pointStats.get(id) ?? { count: 0, ms: 0 };
  s.count += 1;
  s.ms += ms;
  pointStats.set(id, s);

  const key = importer === undefined ? '(sin importer)' : (importer === '' ? '(entry)' : importer);
  const im = pointImporters.get(id) ?? new Map();
  im.set(key, (im.get(key) || 0) + 1);
  pointImporters.set(id, im);
}

function wrapCallback(id, fn) {
  return (...args) => {
    const start = performance.now();
    const importer = args[0] ? args[0].importer : undefined;
    const finish = () => recordHit(id, performance.now() - start, importer);
    let result;
    try {
      result = fn(...args);
    } catch (err) {
      finish();
      throw err;
    }
    if (result && typeof result.then === 'function') {
      return result.then(
        v => { finish(); return v; },
        err => { finish(); throw err; }
      );
    }
    finish();
    return result;
  };
}

function instrumentPluginFactory(factory, resolveIds, loadIds) {
  return (...factoryArgs) => {
    const plugin = factory(...factoryArgs);
    const realSetup = plugin.setup;
    let resolveIdx = 0;
    let loadIdx = 0;
    plugin.setup = (build) => {
      const proxyBuild = Object.create(build);
      proxyBuild.onResolve = (options, callback) => {
        const id = resolveIds[resolveIdx++];
        return build.onResolve(options, id ? wrapCallback(id, callback) : callback);
      };
      proxyBuild.onLoad = (options, callback) => {
        const id = loadIds[loadIdx++];
        return build.onLoad(options, id ? wrapCallback(id, callback) : callback);
      };
      return realSetup(proxyBuild);
    };
    return plugin;
  };
}

// Orden real de registro dentro de cada plugin.setup() (verificado leyendo
// las copias de arriba): routerShim → 1 onResolve; virtualFiles → onResolve,
// onLoad, onResolve; esmSh → onResolve, onResolve, onLoad (no medido), onEnd.
const routerShimPluginInstrumented = instrumentPluginFactory(routerShimPlugin, ['R150'], [null]);
const virtualFilesPluginInstrumented = instrumentPluginFactory(virtualFilesPlugin, ['R225', 'R345'], ['L309']);
const esmShResolverPluginInstrumented = instrumentPluginFactory(esmShResolverPlugin, ['R463', 'R494'], [null]);

const POINTS = ['R150', 'R225', 'R345', 'L309', 'R463', 'R494'];

// ===========================================================================
// PASO 0 — reporte de existencia de los paquetes (verificado con fs.statSync
// real, no supuesto).
// ===========================================================================
function paso0Report() {
  const tslibPath = path.join(REPO_ROOT, 'node_modules/tslib/package.json');
  const icebergPath = path.join(REPO_ROOT, 'node_modules/iceberg-js/package.json');
  const tslibExists = fs.existsSync(tslibPath);
  const icebergExists = fs.existsSync(icebergPath);
  console.log('=== PASO 0 ===');
  console.log(`node_modules/tslib/package.json existe: ${tslibExists}`);
  console.log(`node_modules/iceberg-js/package.json existe: ${icebergExists}`);
  console.log(`corrección aplicada: ${tslibExists && icebergExists ? 'ALIAS_EXTRA_SOLO_HARNESS (ambos paquetes existen en disco)' : 'FALTA IMPLEMENTAR — algún paquete no existe, se requeriría un plugin de módulo vacío en memoria'}`);
}

// ===========================================================================
// requisito 2/3 — filesObj sintético PARAMETRIZADO. src/lib/supabase.ts,
// cuando se incluye, es copia literal del que genera src/templates.ts
// (líneas 311-328, bloque SHADCN_FILES['lib']). Ningún archivo de ningún
// proyecto real.
// ===========================================================================
function makeAppTsx({ lucide, framer, supabase, chainHead }) {
  const imports = [];
  const body = [];
  if (lucide) {
    imports.push(`import { Heart, Star, Menu } from 'lucide-react';`);
    body.push('<Heart />', '<Star />', '<Menu />');
  }
  if (framer) {
    imports.push(`import { motion } from 'framer-motion';`);
  }
  if (supabase) {
    imports.push(`import { createClient } from '@supabase/supabase-js';`);
    imports.push(`import { supabase } from './lib/supabase';`);
  }
  if (chainHead) {
    imports.push(`import Comp0 from './components/Comp0';`);
    body.push('<Comp0 />');
  }

  const clientLines = supabase
    ? `const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const directClient = url && anonKey ? createClient(url, anonKey) : null;
const client = directClient || supabase;`
    : `const client = null;`;

  const wrapOpen = framer ? '<motion.div animate={{ opacity: 1 }} className="wrap">' : '<div className="wrap">';
  const wrapClose = framer ? '</motion.div>' : '</div>';

  return `${imports.join('\n')}

${clientLines}

export default function App() {
  return (
    ${wrapOpen}
      ${body.join('\n      ')}
      <span>{String(!!client)}</span>
    ${wrapClose}
  );
}
`;
}

const SUPABASE_LIB_TS = `import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        lock: async (_name, _acquireTimeout, fn) => await fn(),
      },
    })
  : null
`;

// requisito 3 — cadena de N componentes triviales, cada uno importa al
// siguiente; App importa sólo el primero (Comp0).
function makeComponentChain(n) {
  const files = {};
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const nextImport = isLast ? '' : `import Comp${i + 1} from './Comp${i + 1}';\n`;
    const nextUsage = isLast ? '' : `\n      <Comp${i + 1} />`;
    files[`src/components/Comp${i}.tsx`] = `${nextImport}export default function Comp${i}() {
  return (
    <div className="c${i}">
      <span>comp-${i}</span>${nextUsage}
    </div>
  );
}
`;
  }
  return files;
}

function makeFilesObj({ lucide = true, framer = true, supabase = true, chainLength = 0 }) {
  const files = {
    'src/main.tsx': `import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')).render(<App />);
`,
    'src/App.tsx': makeAppTsx({ lucide, framer, supabase, chainHead: chainLength > 0 }),
    'src/index.css': `body { margin: 0; }\n`,
  };
  if (supabase) {
    files['src/lib/supabase.ts'] = SUPABASE_LIB_TS;
  }
  if (chainLength > 0) {
    Object.assign(files, makeComponentChain(chainLength));
  }
  return files;
}

// requisito 6 — mismo entrypoint que compileFiles (compiler.js:829-836)
const entryCandidates = ['src/main.tsx', 'src/main.ts', 'src/index.tsx', 'src/index.ts'];
function resolveEntry(filesObj) {
  const entry = entryCandidates.find(c => filesObj[c]);
  if (!entry) throw new Error('filesObj sintético sin entrypoint — no debería pasar');
  return entry;
}

const dbCredentials = null; // requisito 6

// ===========================================================================
// requisito 1 — resumen de metafile: total de inputs, top 10 paquetes de
// node_modules (primer nivel) por bytes con su conteo de inputs, e inputs
// que pertenecen al filesObj (namespace 'virtual' de virtualFilesPlugin).
// ===========================================================================
function summarizeMetafile(metafile) {
  if (!metafile) return null;
  const inputs = metafile.inputs;
  const keys = Object.keys(inputs);
  const pkgAgg = new Map(); // pkgName -> { count, bytes }
  let projectInputs = 0;

  for (const k of keys) {
    const bytes = inputs[k].bytes;
    const nmIdx = k.indexOf('node_modules/');
    if (nmIdx !== -1) {
      const rest = k.slice(nmIdx + 'node_modules/'.length);
      const parts = rest.split('/');
      const pkg = parts[0].startsWith('@') && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
      const agg = pkgAgg.get(pkg) ?? { count: 0, bytes: 0 };
      agg.count += 1;
      agg.bytes += bytes;
      pkgAgg.set(pkg, agg);
    } else if (k.startsWith('virtual:')) {
      projectInputs += 1;
    }
  }

  const top10 = [...pkgAgg.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 10);
  return { totalInputs: keys.length, top10, projectInputs };
}

function printMetafileSummary(label, summary) {
  if (!summary) {
    console.log(`${label} metafile: N/A (build sin metafile — ver errors.length)`);
    return;
  }
  console.log(`${label} metafile: inputs_totales=${summary.totalInputs} inputs_filesObj=${summary.projectInputs}`);
  console.log(`${label} top10 paquetes node_modules (pkg=inputs/bytes):`);
  if (summary.top10.length === 0) {
    console.log('  (ninguno)');
  } else {
    for (const [pkg, agg] of summary.top10) {
      console.log(`  ${pkg} = ${agg.count} inputs / ${agg.bytes} bytes`);
    }
  }
}

// ===========================================================================
// requisito A — bytes de salida. write:false sigue igual que
// compiler.js:855 (nunca se escribe a disco); lo nuevo es que SUMAMOS los
// outputFiles que ya devuelve esbuild, exactamente con el mismo criterio de
// partición JS/CSS que compileFiles usa al armar el bundle (compiler.js:
// 887-893: out.path.endsWith('.css') → CSS, si no → JS). Bytes reales
// (Buffer.byteLength), no longitud de string.
// ===========================================================================
function sumOutputBytes(outputFiles) {
  let bytesJS = 0;
  let bytesCSS = 0;
  for (const out of outputFiles) {
    const bytes = Buffer.byteLength(out.text, 'utf8');
    if (out.path.endsWith('.css')) bytesCSS += bytes;
    else bytesJS += bytes;
  }
  return { bytesJS, bytesCSS };
}

// ===========================================================================
// Una corrida de build, con las MISMAS opciones que compiler.js:852-882
// (salvo dbCredentials=null y metafile:true añadido — requisito 1). `alias`
// es opcional: por defecto el ALIAS de arriba; los escenarios E7-E9
// (requisito C) pasan una copia con lucide-react/framer-motion apuntando al
// .mjs pre-empaquetado. Devuelve las métricas de los 6 puntos, el desglose
// R225/statSync, el metafile resumido, result.errors.length y los bytes de
// salida JS/CSS (requisito A).
// ===========================================================================
async function runBuild(filesObj, alias = ALIAS, options = {}) {
  const { extraBuildOptions = {}, checkIconNames = null } = options;
  const entry = resolveEntry(filesObj);

  resetPointStats();
  vfs225Guard = 0;
  vfs225FilesObj = 0;
  vfsStatSyncCalls = 0;
  vfsStatSyncMs = 0;
  fetchAttempts = 0;
  globalThis.fetch = countingFetch;

  const oidMap = {};
  const startEsbuild = Date.now();
  let rejected = null;
  let errorsLength = null; // null = build rechazado, no hay metafile/errors fiables
  let metafileSummary = null;
  let bytesJS = null;
  let bytesCSS = null;
  let iconPresence = null; // requisito v4 — sólo se rellena si checkIconNames viene dado

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
        'global': 'window',
        'import.meta.env.VITE_SUPABASE_URL': dbCredentials?.url
          ? JSON.stringify(dbCredentials.url) : 'undefined',
        'import.meta.env.VITE_SUPABASE_ANON_KEY': dbCredentials?.anonKey
          ? JSON.stringify(dbCredentials.anonKey) : 'undefined',
      },
      alias,
      banner: {
        js: '// Wyrd Forge preview bundle\n;(function(){'
      },
      footer: {
        js: '})();'
      },
      plugins: [
        routerShimPluginInstrumented(),
        virtualFilesPluginInstrumented(filesObj, oidMap),
        esmShResolverPluginInstrumented()
      ],
      metafile: true, // requisito nuevo 1
      logLevel: 'silent',
      ...extraBuildOptions, // v4 — E11 pasa aquí pure:['createLucideIcon']
    });
    errorsLength = result.errors.length;
    metafileSummary = summarizeMetafile(result.metafile);
    ({ bytesJS, bytesCSS } = sumOutputBytes(result.outputFiles)); // requisito A
    if (checkIconNames) {
      iconPresence = checkIconsPresent(result.outputFiles, checkIconNames); // v4
    }
  } catch (err) {
    rejected = err && err.message ? err.message : String(err);
  } finally {
    globalThis.fetch = realFetch;
  }
  const esbuildMs = Date.now() - startEsbuild;

  return {
    esbuildMs,
    rejected,               // string si esbuild.build() rechazó la promesa, si no null
    errorsLength,            // null si rejected !== null (sin metafile/errors fiables)
    metafileSummary,
    bytesJS,                 // requisito A — null si rejected !== null
    bytesCSS,                // requisito A — null si rejected !== null
    pointStats: new Map(pointStats),
    pointImporters: new Map([...pointImporters].map(([k, v]) => [k, new Map(v)])),
    vfs225Guard,
    vfs225FilesObj,
    vfsStatSyncCalls,
    vfsStatSyncMs,
    fetchAttempts,
    iconPresence, // v4 — null salvo que options.checkIconNames viniera dado
  };
}

// ===========================================================================
// v4 — comprueba, por nombre, si un icono sigue presente en el JS de salida
// (result.outputFiles, ignorando CSS). Búsqueda por palabra completa sobre
// el texto concatenado de todos los outputFiles JS; sin minify (no se pasa
// minify:true en ningún build de este harness) los identificadores de
// createLucideIcon('Heart', ...) / export { Heart } sobreviven tal cual si
// no se eliminan por tree-shaking.
// ===========================================================================
function checkIconsPresent(outputFiles, iconNames) {
  const combined = (outputFiles || [])
    .filter(o => !o.path.endsWith('.css'))
    .map(o => o.text)
    .join('\n');
  const presence = {};
  for (const name of iconNames) {
    presence[name] = new RegExp(`\\b${name}\\b`).test(combined);
  }
  return presence;
}

function topImporters(im, n = 5) {
  if (!im) return [];
  return [...im.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// errors.length "crudo" para las tablas compactas: si el build fue
// rechazado, no hay número fiable — se marca explícitamente.
function errorsLabel(r) {
  if (r.rejected !== null) return 'INVALIDA(build_rechazado)';
  return String(r.errorsLength);
}

function printFullPointReport(label, r) {
  console.log(`\n=== ${label} ===`);
  if (r.rejected) {
    console.log(`build RECHAZADO — medición NO válida: ${r.rejected}`);
  }
  console.log(`errors.length = ${errorsLabel(r)}`);
  console.log('punto | invocaciones | ms_total | ms_medio');
  for (const id of POINTS) {
    const s = r.pointStats.get(id) ?? { count: 0, ms: 0 };
    const media = s.count > 0 ? (s.ms / s.count) : 0;
    console.log(`${id}  | ${s.count} | ${s.ms.toFixed(3)} | ${media.toFixed(3)}`);
  }

  console.log(`\nR225 desglose: guarda=${r.vfs225Guard} filesObj=${r.vfs225FilesObj} statSync_llamadas=${r.vfsStatSyncCalls} statSync_ms=${r.vfsStatSyncMs.toFixed(3)}`);

  for (const id of POINTS) {
    const top = topImporters(r.pointImporters.get(id));
    const rendered = top.length
      ? top.map(([importer, count]) => `${importer}=${count}`).join(', ')
      : '(sin invocaciones)';
    console.log(`${id} top importers: ${rendered}`);
  }

  printMetafileSummary(label, r.metafileSummary);

  console.log(`\nesbuild ${label} = ${r.esbuildMs}ms`);
  console.log(`bytes de salida ${label}: JS=${bytesLabel(r.bytesJS)} CSS=${bytesLabel(r.bytesCSS)}`);
  console.log(`fetches esm.sh intentados en ${label}: ${r.fetchAttempts}`);
}

function bytesLabel(b) {
  return b === null ? 'N/A' : String(b);
}

// requisito nuevo 2 / requisito A — línea compacta ms/errors.length/inputs/
// bytes_JS/bytes_CSS por corrida, aplica a TODOS los escenarios (E1-E9) y a
// BASELINE.
function printScenarioRunLine(scenarioId, runIdx, r) {
  const inputs = r.metafileSummary ? r.metafileSummary.totalInputs : 'N/A';
  console.log(`${scenarioId} run${runIdx} | ms=${r.esbuildMs} | errors.length=${errorsLabel(r)} | inputs=${inputs} | bytes_JS=${bytesLabel(r.bytesJS)} | bytes_CSS=${bytesLabel(r.bytesCSS)}`);
}

// ===========================================================================
// requisito B — pre-empaquetado de vendor. Dado un nombre de paquete y su
// entry actual del ALIAS, produce UN SOLO .mjs pre-empaquetado en un
// directorio temporal con un esbuild.build PREVIO (bundle:true, format:esm,
// splitting:false, minify:false, write:true), usando los mismos
// mainFields/conditions/resolveExtensions que el build principal
// (compiler.js:862-864). Se mide tiempo y bytes del .mjs resultante. Esto se
// llama UNA VEZ por paquete, fuera del cronómetro de cualquier escenario.
// ===========================================================================
async function prebundlePackage(pkgName, entryPath, outDir, extraOptions = {}) {
  const safeName = pkgName.replace(/[@/]/g, '_');
  const outfile = path.join(outDir, `${safeName}.mjs`);
  const start = Date.now();
  await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    splitting: false,
    minify: false,
    write: true,
    outfile,
    mainFields: ['module', 'main'],
    conditions: ['development', 'module', 'browser', 'default'],
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.css', '.json'],
    logLevel: 'silent',
    ...extraOptions, // v4 — E10/E11 pasan pure:['createLucideIcon'] aquí
  });
  const ms = Date.now() - start;
  const bytes = fs.statSync(outfile).size;
  return { pkgName, outfile, ms, bytes };
}

// requisito D — mediana de 3 corridas por ms_total; devuelve la corrida
// mediana completa (inputs/bytes/errors reportados vienen de esa misma
// corrida, no se mezclan entre corridas).
function medianRun(runs) {
  const sorted = [...runs].sort((a, b) => a.esbuildMs - b.esbuildMs);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  paso0Report();

  // ---------------------------------------------------------------------
  // MANTENER de v1 — baseline (equivalente a E1), 3 corridas, reporte
  // completo de los 6 puntos + desglose R225 + statSync + top importers,
  // ahora también con metafile y errors.length por corrida (requisito 1).
  // ---------------------------------------------------------------------
  console.log('\n########## BASELINE (equivalente a E1, reporte completo v1 + metafile) ##########');
  const baselineFiles = makeFilesObj({ lucide: true, framer: true, supabase: true, chainLength: 0 });
  const baselineResults = [];
  for (let i = 1; i <= 3; i++) {
    const r = await runBuild(baselineFiles);
    baselineResults.push(r);
    printFullPointReport(`BASELINE run${i}`, r);
  }
  console.log(`\nesbuild total baseline run1=${baselineResults[0].esbuildMs}ms run2=${baselineResults[1].esbuildMs}ms run3=${baselineResults[2].esbuildMs}ms`);
  console.log(`errors.length baseline: run1=${errorsLabel(baselineResults[0])} run2=${errorsLabel(baselineResults[1])} run3=${errorsLabel(baselineResults[2])}`);

  // ---------------------------------------------------------------------
  // requisito nuevo 2 — E1..E5, 3 corridas cada una, ms/errors.length/inputs
  // ---------------------------------------------------------------------
  console.log('\n########## ESCENARIOS DE AISLAMIENTO (E1-E5) ##########');
  const scenarios = [
    { id: 'E1', desc: 'completo (lucide-react + framer-motion + supabase-js)', flags: { lucide: true, framer: true, supabase: true } },
    { id: 'E2', desc: 'sin lucide-react', flags: { lucide: false, framer: true, supabase: true } },
    { id: 'E3', desc: 'sin framer-motion', flags: { lucide: true, framer: false, supabase: true } },
    { id: 'E4', desc: 'sin lucide-react ni framer-motion', flags: { lucide: false, framer: false, supabase: true } },
    { id: 'E5', desc: 'solo React, sin ninguna librería externa', flags: { lucide: false, framer: false, supabase: false } },
  ];

  const scenarioResults = {};
  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario.id}: ${scenario.desc} ---`);
    const files = makeFilesObj({ ...scenario.flags, chainLength: 0 });
    const runs = [];
    for (let i = 1; i <= 3; i++) {
      const r = await runBuild(files);
      runs.push(r);
      printScenarioRunLine(scenario.id, i, r);
      printMetafileSummary(`${scenario.id} run${i}`, r.metafileSummary);
    }
    scenarioResults[scenario.id] = runs;
  }

  // ---------------------------------------------------------------------
  // requisito nuevo 3 — E6: E1 + 60 archivos .tsx sintéticos en cadena.
  // L309 (onLoad de virtualFilesPlugin / instrumentSource) reportado aparte.
  // ---------------------------------------------------------------------
  console.log('\n########## E6: E1 + 60 archivos .tsx sintéticos en cadena ##########');
  const e6Files = makeFilesObj({ lucide: true, framer: true, supabase: true, chainLength: 60 });
  const e6Results = [];
  for (let i = 1; i <= 3; i++) {
    const r = await runBuild(e6Files);
    e6Results.push(r);
    printScenarioRunLine('E6', i, r);
    printMetafileSummary(`E6 run${i}`, r.metafileSummary);
    const l309 = r.pointStats.get('L309') ?? { count: 0, ms: 0 };
    console.log(`E6 run${i} L309: invocaciones=${l309.count} ms_total=${l309.ms.toFixed(3)} ms_medio=${(l309.count > 0 ? l309.ms / l309.count : 0).toFixed(3)}`);
  }
  scenarioResults.E6 = e6Results;

  // ---------------------------------------------------------------------
  // requisito B — pre-empaquetado de vendor. UNA VEZ, fuera del cronómetro
  // de cualquier escenario. Entry actual = ALIAS['lucide-react'] /
  // ALIAS['framer-motion'] (los mismos .mjs que ya usa el build principal).
  // ---------------------------------------------------------------------
  console.log('\n########## PRE-EMPAQUETADO DE VENDOR (requisito B, corre UNA VEZ) ##########');
  const prebundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-perf-harness-vendor-'));
  const lucidePrebundle = await prebundlePackage('lucide-react', ALIAS['lucide-react'], prebundleDir);
  const framerPrebundle = await prebundlePackage('framer-motion', ALIAS['framer-motion'], prebundleDir);
  console.log(`pre-empaquetado lucide-react: ms=${lucidePrebundle.ms} bytes=${lucidePrebundle.bytes} outfile=${lucidePrebundle.outfile}`);
  console.log(`pre-empaquetado framer-motion: ms=${framerPrebundle.ms} bytes=${framerPrebundle.bytes} outfile=${framerPrebundle.outfile}`);

  // ---------------------------------------------------------------------
  // requisito C — E7/E8/E9: mismo filesObj que E1/E6, pero con ALIAS
  // sustituyendo lucide-react y/o framer-motion por el .mjs pre-empaquetado.
  // ---------------------------------------------------------------------
  console.log('\n########## ESCENARIOS DE PRE-EMPAQUETADO (E7-E9) ##########');
  const aliasE7 = { ...ALIAS, 'lucide-react': lucidePrebundle.outfile };
  const aliasE8 = { ...ALIAS, 'lucide-react': lucidePrebundle.outfile, 'framer-motion': framerPrebundle.outfile };
  const aliasE9 = aliasE8;

  const prebundleScenarios = [
    { id: 'E7', desc: "E1 con 'lucide-react' pre-empaquetado", filesObj: baselineFiles, alias: aliasE7 },
    { id: 'E8', desc: "E7 + 'framer-motion' pre-empaquetado", filesObj: baselineFiles, alias: aliasE8 },
    { id: 'E9', desc: 'E8 + cadena de 60 .tsx (equivalente a E6)', filesObj: e6Files, alias: aliasE9 },
  ];

  for (const scenario of prebundleScenarios) {
    console.log(`\n--- ${scenario.id}: ${scenario.desc} ---`);
    const runs = [];
    for (let i = 1; i <= 3; i++) {
      const r = await runBuild(scenario.filesObj, scenario.alias);
      runs.push(r);
      printScenarioRunLine(scenario.id, i, r);
      printMetafileSummary(`${scenario.id} run${i}`, r.metafileSummary);
    }
    scenarioResults[scenario.id] = runs;
  }

  // ---------------------------------------------------------------------
  // v4 — E10/E11: rescatar el tree-shaking de lucide-react vía
  // pure:['createLucideIcon'] en el pre-empaquetado (E10) y además en el
  // build consumidor (E11). framer-motion se deja EXACTAMENTE como ALIAS
  // base (node_modules, sin pre-empaquetar) en ambos — sólo se toca
  // lucide-react.
  // ---------------------------------------------------------------------
  console.log("\n########## ESCENARIOS PURE:['createLucideIcon'] (E10-E11) ##########");
  const ICON_NAMES = ['Heart', 'Star', 'Menu'];
  const lucidePrebundlePure = await prebundlePackage(
    'lucide-react-pure',
    ALIAS['lucide-react'],
    prebundleDir,
    { pure: ['createLucideIcon'] }
  );
  console.log(`pre-empaquetado lucide-react (pure:['createLucideIcon']): ms=${lucidePrebundlePure.ms} bytes=${lucidePrebundlePure.bytes} outfile=${lucidePrebundlePure.outfile}`);

  const aliasE10 = { ...ALIAS, 'lucide-react': lucidePrebundlePure.outfile };

  const pureScenarios = [
    {
      id: 'E10',
      desc: "E7 pero el pre-empaquetado de lucide-react lleva pure:['createLucideIcon']",
      alias: aliasE10,
      extraBuildOptions: {},
    },
    {
      id: 'E11',
      desc: "E10 + pure:['createLucideIcon'] también en el build consumidor",
      alias: aliasE10,
      extraBuildOptions: { pure: ['createLucideIcon'] },
    },
  ];

  for (const scenario of pureScenarios) {
    console.log(`\n--- ${scenario.id}: ${scenario.desc} ---`);
    const runs = [];
    for (let i = 1; i <= 3; i++) {
      const r = await runBuild(baselineFiles, scenario.alias, {
        extraBuildOptions: scenario.extraBuildOptions,
        checkIconNames: ICON_NAMES,
      });
      runs.push(r);
      printScenarioRunLine(scenario.id, i, r);
      printMetafileSummary(`${scenario.id} run${i}`, r.metafileSummary);
      const icons = r.iconPresence || {};
      console.log(`${scenario.id} run${i} iconos_presentes: ` +
        ICON_NAMES.map(name => `${name}=${icons[name] ?? 'N/A'}`).join(' '));
    }
    scenarioResults[scenario.id] = runs;
  }

  // ---------------------------------------------------------------------
  // v4 — E12: SOLO framer-motion pre-empaquetado (reusa el .mjs de E7-E9).
  // lucide-react se deja EXACTAMENTE como está hoy (ALIAS base, sin tocar).
  // ---------------------------------------------------------------------
  console.log('\n########## E12: FRAMER SOLO (candidato seguro) ##########');
  const aliasE12 = { ...ALIAS, 'framer-motion': framerPrebundle.outfile };
  {
    const runs = [];
    for (let i = 1; i <= 3; i++) {
      const r = await runBuild(baselineFiles, aliasE12);
      runs.push(r);
      printScenarioRunLine('E12', i, r);
      printMetafileSummary(`E12 run${i}`, r.metafileSummary);
    }
    scenarioResults.E12 = runs;
  }

  // ---------------------------------------------------------------------
  // requisito D — comparativa final. Una línea por escenario (E1..E9), con
  // los valores de la corrida MEDIANA por ms_total (misma corrida para
  // inputs/bytes_JS/errors — no se mezclan entre corridas). Más dos líneas
  // de pre-empaquetado.
  // ---------------------------------------------------------------------
  console.log('\n=== COMPARATIVA FINAL (requisito D) ===');
  console.log('escenario | ms_mediana | inputs | bytes_JS | errors');
  const allScenarioIds = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12'];
  for (const id of allScenarioIds) {
    const runs = scenarioResults[id];
    const med = medianRun(runs);
    const inputs = med.metafileSummary ? med.metafileSummary.totalInputs : 'N/A';
    console.log(`${id} | ${med.esbuildMs} | ${inputs} | ${bytesLabel(med.bytesJS)} | ${errorsLabel(med)}`);
    if (med.iconPresence) {
      console.log(`  ${id} iconos_presentes (corrida mediana): ` +
        ICON_NAMES.map(name => `${name}=${med.iconPresence[name] ?? 'N/A'}`).join(' '));
    }
  }
  console.log(`pre-empaquetado lucide-react | ${lucidePrebundle.ms} | ${lucidePrebundle.bytes}`);
  console.log(`pre-empaquetado framer-motion | ${framerPrebundle.ms} | ${framerPrebundle.bytes}`);
  console.log(`pre-empaquetado lucide-react (pure:['createLucideIcon']) | ${lucidePrebundlePure.ms} | ${lucidePrebundlePure.bytes}`);

  console.log('\n=== E10/E11 CRITERIO DE ÉXITO (bascula) ===');
  console.log('objetivo: bytes_JS cercano a E1 (~1.861.443) con el tiempo de E7 (~812ms). Si bytes_JS > 2.5M, el candidato ha fallado.');
  for (const id of ['E10', 'E11']) {
    const med = medianRun(scenarioResults[id]);
    const veredicto = med.bytesJS === null
      ? 'INVALIDO (build rechazado)'
      : (med.bytesJS > 2_500_000 ? 'FALLIDO (bytes_JS > 2.5M)' : 'bytes_JS <= 2.5M');
    console.log(`${id}: bytes_JS=${bytesLabel(med.bytesJS)} ms=${med.esbuildMs} -> ${veredicto}`);
  }

  console.log('\n=== RESUMEN ===');
  console.log(`esbuild total baseline run1=${baselineResults[0].esbuildMs}ms run2=${baselineResults[1].esbuildMs}ms run3=${baselineResults[2].esbuildMs}ms`);
  for (const id of allScenarioIds) {
    const runs = scenarioResults[id];
    console.log(`esbuild total ${id} run1=${runs[0].esbuildMs}ms run2=${runs[1].esbuildMs}ms run3=${runs[2].esbuildMs}ms`);
  }

  const allResults = [
    ...baselineResults,
    ...Object.values(scenarioResults).flat(),
  ];
  const totalFetches = allResults.reduce((sum, r) => sum + r.fetchAttempts, 0);
  console.log(`fetches esm.sh intentados (todas las corridas): ${totalFetches}`);
  const invalidRuns = allResults.filter(r => r.rejected !== null).length;
  console.log(`corridas con build RECHAZADO (medición no válida): ${invalidRuns} de ${allResults.length}`);

  fs.rmSync(prebundleDir, { recursive: true, force: true });

  console.log('\nPara reejecutar exactamente esto:');
  console.log('  node scripts/compilerPerfHarness.mjs');
}

main().catch(err => {
  console.error('[harness] fallo no capturado:', err);
  process.exitCode = 1;
});
