// ---------------------------------------------------------------------------
// typecheck — revisión de tipos de un proyecto generado, igual que `tsc -b` en
// Vercel (bucket 6, 2026-09-29).
//
// El preview compila con esbuild, que NO revisa tipos: un proyecto podía
// funcionar en el editor y fallar al publicar (`tsc -b` sale con errores). Este
// módulo usa el TypeScript y las librerías EXACTAS de la plantilla, instalados
// en server/typeenv (ver src/utils/typeEnvManifest.ts), sobre los archivos del
// proyecto en memoria.
//
// Además arregla SOLO lo trivial de forma determinista: borra imports sin usar
// con el arreglador oficial de TypeScript (`unusedIdentifier_deleteImports`).
// Todo lo demás se reporta; decidir qué hacer con ello es del Verifier.
//
// Fail-open: si el entorno no está instalado devuelve { available: false } y el
// caller sigue como antes. Nunca lanza por un proyecto roto.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const DEFAULT_TYPEENV_DIR = fileURLToPath(new URL('./typeenv/', import.meta.url));

/** compilerOptions de tsconfig.app.json de la plantilla (src/templates.ts). */
const TEMPLATE_APP_COMPILER_OPTIONS = {
  target: 'ES2020',
  useDefineForClassFields: true,
  lib: ['ES2020', 'DOM', 'DOM.Iterable'],
  module: 'ESNext',
  skipLibCheck: true,
  moduleResolution: 'bundler',
  allowImportingTsExtensions: true,
  resolveJsonModule: true,
  isolatedModules: true,
  noEmit: true,
  jsx: 'react-jsx',
  strict: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noFallthroughCasesInSwitch: true,
  baseUrl: '.',
  paths: { '@/*': ['./src/*'] },
};

/** Imports sin usar: el único arreglo que se aplica sin modelo. */
const UNUSED_IMPORT_CODES = new Set([6133, 6192]);
/** Módulo npm sin tipos disponibles en el entorno: no verificable, no error. */
const MODULE_NOT_FOUND_CODES = new Set([2307, 7016]);

const MAX_MESSAGE = 600;

let cache = null; // { dir, ts, registry }

function loadTypeScript(typeEnvDir) {
  if (cache && cache.dir === typeEnvDir) return cache;
  if (!fs.existsSync(path.join(typeEnvDir, 'node_modules', 'typescript', 'package.json'))) return null;
  const require = createRequire(path.join(typeEnvDir, 'package.json'));
  const ts = require('typescript');
  cache = { dir: typeEnvDir, ts, registry: ts.createDocumentRegistry() };
  return cache;
}

const toPosix = (p) => p.replace(/\\/g, '/');

function isProjectSource(rel) {
  return rel.startsWith('src/') && /\.(ts|tsx)$/.test(rel);
}

/** Módulo "bare" (paquete npm), no relativo ni alias del proyecto. */
function isBareSpecifier(spec) {
  return !spec.startsWith('.') && !spec.startsWith('/') && !spec.startsWith('@/');
}

function projectCompilerOptions(ts, files, root) {
  let json = { compilerOptions: TEMPLATE_APP_COMPILER_OPTIONS };
  const raw = files['tsconfig.app.json'];
  if (typeof raw === 'string') {
    const parsed = ts.parseConfigFileTextToJson('tsconfig.app.json', raw);
    if (!parsed.error && parsed.config?.compilerOptions) json = parsed.config;
  }
  const { options } = ts.convertCompilerOptionsFromJson(json.compilerOptions, root);
  return { ...options, noEmit: true };
}

/**
 * @param {Record<string, string>} files  path relativo al proyecto → contenido
 * @param {{ autoFix?: boolean, typeEnvDir?: string }} [opts]
 * @returns {{ available: false, reason: string }
 *   | { available: true, errors: TypeIssue[], unverifiable: TypeIssue[],
 *       fixedFiles: Record<string, string>, autoFixed: number, durationMs: number }}
 *
 * TypeIssue = { file: string|null, line: number|null, column: number|null, code: number, message: string }
 */
export function typecheckProject(files, opts = {}) {
  const startedAt = Date.now();
  const typeEnvDir = opts.typeEnvDir ?? DEFAULT_TYPEENV_DIR;
  const autoFix = opts.autoFix !== false;
  const loaded = loadTypeScript(typeEnvDir);
  if (!loaded) return { available: false, reason: 'typeenv not installed' };
  const { ts, registry } = loaded;

  // Raíz virtual DENTRO de typeenv: la resolución de módulos sube de carpeta
  // en carpeta y encuentra typeenv/node_modules, como en el proyecto real.
  const root = toPosix(path.join(typeEnvDir, '__project__'));
  const abs = (rel) => `${root}/${rel}`;
  const relOf = (file) => (toPosix(file).startsWith(root + '/') ? toPosix(file).slice(root.length + 1) : null);

  const current = new Map(); // abs → contenido
  for (const [rel, content] of Object.entries(files ?? {})) {
    if (typeof content === 'string') current.set(abs(toPosix(rel).replace(/^\/+/, '')), content);
  }
  const versions = new Map();
  const virtualDirs = new Set();
  for (const file of current.keys()) {
    let dir = file.slice(0, file.lastIndexOf('/'));
    while (dir.length >= root.length) { virtualDirs.add(dir); dir = dir.slice(0, dir.lastIndexOf('/')); }
  }

  const rootNames = [...current.keys()].filter((f) => isProjectSource(relOf(f)));
  const options = projectCompilerOptions(ts, files ?? {}, root);

  const inProject = (f) => toPosix(f).startsWith(root + '/');
  const readFile = (f) => (inProject(f) ? current.get(toPosix(f)) : ts.sys.readFile(f));
  const host = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => rootNames,
    getScriptVersion: (f) => String(versions.get(toPosix(f)) ?? 0),
    getScriptSnapshot: (f) => {
      const text = readFile(f);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (f) => (inProject(f) ? current.has(toPosix(f)) : ts.sys.fileExists(f)),
    readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: (d) => (inProject(d) || toPosix(d) === root ? virtualDirs.has(toPosix(d)) : ts.sys.directoryExists(d)),
    getDirectories: (d) => (inProject(d) ? [] : ts.sys.getDirectories(d)),
    realpath: ts.sys.realpath,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  };
  const service = ts.createLanguageService(host, registry);

  const collect = () => {
    const out = [];
    for (const file of rootNames) {
      for (const d of [...service.getSyntacticDiagnostics(file), ...service.getSemanticDiagnostics(file)]) {
        if (d.category !== ts.DiagnosticCategory.Error) continue;
        let line = null;
        let column = null;
        if (d.file && typeof d.start === 'number') {
          const pos = d.file.getLineAndCharacterOfPosition(d.start);
          line = pos.line + 1;
          column = pos.character + 1;
        }
        out.push({
          file: relOf(d.file?.fileName ?? file),
          line,
          column,
          code: d.code,
          message: ts.flattenDiagnosticMessageText(d.messageText, '\n').slice(0, MAX_MESSAGE),
        });
      }
    }
    return out;
  };

  let diagnostics = collect();
  const fixedFiles = {};
  let autoFixed = 0;

  if (autoFix) {
    const filesWithUnusedImports = [...new Set(
      diagnostics.filter((d) => UNUSED_IMPORT_CODES.has(d.code) && d.file).map((d) => abs(d.file))
    )];
    for (const file of filesWithUnusedImports) {
      let fix;
      try {
        fix = service.getCombinedCodeFix(
          { type: 'file', fileName: file },
          'unusedIdentifier_deleteImports',
          ts.getDefaultFormatCodeSettings('\n'),
          {}
        );
      } catch {
        continue; // un arreglo que no se puede calcular no debe tumbar la revisión
      }
      for (const change of fix.changes) {
        const target = toPosix(change.fileName);
        const before = current.get(target);
        if (before === undefined) continue;
        let text = before;
        for (const edit of [...change.textChanges].sort((a, b) => b.span.start - a.span.start)) {
          text = text.slice(0, edit.span.start) + edit.newText + text.slice(edit.span.start + edit.span.length);
        }
        if (text !== before) {
          current.set(target, text);
          versions.set(target, (versions.get(target) ?? 0) + 1);
          fixedFiles[relOf(target)] = text;
        }
      }
    }
    if (Object.keys(fixedFiles).length > 0) {
      const beforeCount = diagnostics.length;
      diagnostics = collect();
      autoFixed = Math.max(0, beforeCount - diagnostics.length);
    }
  }

  const errors = [];
  const unverifiable = [];
  for (const d of diagnostics) {
    const spec = MODULE_NOT_FOUND_CODES.has(d.code) ? /module '([^']+)'/.exec(d.message)?.[1] : null;
    if (spec && isBareSpecifier(spec)) unverifiable.push(d);
    else errors.push(d);
  }

  service.dispose();
  return { available: true, errors, unverifiable, fixedFiles, autoFixed, durationMs: Date.now() - startedAt };
}

/** Una línea por error, con el mismo formato que imprime `tsc`. */
export function formatTypeIssue(issue) {
  const where = issue.file ? `${issue.file}(${issue.line ?? 0},${issue.column ?? 0}): ` : '';
  return `${where}error TS${issue.code}: ${issue.message}`;
}
