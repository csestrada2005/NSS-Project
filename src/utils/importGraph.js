/**
 * importGraph — quién importa a quién, calculado de los CONTENIDOS reales de
 * los archivos del proyecto. Determinista, sin modelo, sin red.
 *
 * POR QUÉ EXISTE
 * --------------
 * El Architect decidía qué es "código muerto" por semántica del nombre: marcó
 * delete sobre src/components/sections/MenuSection.tsx describiéndolo como
 * "exclusively used by the Menu page" cuando quien lo importa es
 * src/pages/Index.tsx — la landing — y con la página Menú no comparte más que
 * la palabra "Menu". El plan no tenía forma de saberlo: el único contexto de
 * estructura que recibe (el blueprint) es una lista de PATHS, sin contenidos y
 * sin imports. Decidía a ciegas.
 *
 * Este módulo produce la señal que faltaba, en dos consumos:
 *  - Capa A: `buildImportedByBlock()` inyecta el "importado por" de cada
 *    candidato en el prompt del Architect, para que el ORPHAN TEST se resuelva
 *    con evidencia y no por parecido de nombre.
 *  - Capa B: `importersOfPath()` es el guard determinista del Implementer,
 *    hermano de isUndeletablePath: un delete sobre un archivo que algún
 *    superviviente todavía importa se rechaza antes de ejecutarse.
 *
 * La resolución de specifiers reutiliza candidatePathsFor() de
 * resolveModulePath.js — misma política que el plugin virtual del compilador
 * (alias '@/' → 'src/', relativos contra el importador, extensiones e index).
 * Un specifier que no resuelve a un path del proyecto (paquete npm, texto
 * suelto) simplemente no produce arista.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * resolveModulePath.js. El tipado vive en importGraph.d.ts.
 */

import { candidatePathsFor } from './resolveModulePath.js';

/** Extensiones cuyo contenido tiene sentido escanear en busca de imports. */
export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * `import ... from '<spec>'`, `export ... from '<spec>'`, `import '<spec>'` y
 * `import('<spec>')`. Mismo regex que la auditoría de dependencias del
 * orquestador: sobre-detectar es la dirección segura (una arista de más sólo
 * puede impedir un borrado, nunca provocarlo).
 */
const IMPORT_RE =
  /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/**
 * Normaliza el mapa de archivos: acepta Map<string,string> (lo que circula por
 * las lanes) o un objeto plano (cómodo en tests).
 *
 * @param {Map<string,string>|Record<string,string>} files
 * @returns {Map<string,string>}
 */
function asMap(files) {
  if (files instanceof Map) return files;
  return new Map(Object.entries(files ?? {}));
}

/** ¿Es un archivo del proyecto cuyo contenido escaneamos? */
function isScannableSource(path) {
  if (typeof path !== 'string') return false;
  if (path.includes('node_modules') || path.includes('dist/')) return false;
  return SOURCE_EXTENSIONS.some((e) => path.endsWith(e));
}

/**
 * Specifiers citados por un contenido, en orden de aparición y sin duplicados.
 *
 * @param {string} content
 * @returns {string[]}
 */
export function extractSpecifiers(content) {
  if (typeof content !== 'string' || content.length === 0) return [];
  const out = [];
  const seen = new Set();
  IMPORT_RE.lastIndex = 0;
  let m;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const spec = m[1] ?? m[2];
    if (!spec || seen.has(spec)) continue;
    seen.add(spec);
    out.push(spec);
  }
  return out;
}

/**
 * Paths del proyecto que `importer` importa realmente: para cada specifier, el
 * PRIMER candidato de candidatePathsFor() que existe en el mapa (mismo orden de
 * preferencia que prueba el compilador).
 *
 * @param {string} importer
 * @param {Map<string,string>|Record<string,string>} files
 * @returns {string[]}
 */
export function resolvedImportsOf(importer, files) {
  const map = asMap(files);
  const content = map.get(importer);
  if (typeof content !== 'string') return [];

  const out = [];
  const seen = new Set();
  for (const spec of extractSpecifiers(content)) {
    for (const candidate of candidatePathsFor(spec, importer)) {
      if (!map.has(candidate)) continue;
      if (candidate !== importer && !seen.has(candidate)) {
        seen.add(candidate);
        out.push(candidate);
      }
      break; // el compilador se queda con el primero que resuelve
    }
  }
  return out;
}

/**
 * Grafo inverso completo: path → paths que lo importan (ordenados).
 *
 * `ignorePaths` saca archivos del lado IMPORTADOR: son los que el plan va a
 * borrar, así que sus imports no mantienen vivo a nadie.
 *
 * @param {Map<string,string>|Record<string,string>} files
 * @param {{ ignorePaths?: Iterable<string> }} [options]
 * @returns {Map<string, string[]>}
 */
export function buildImportedByMap(files, options = {}) {
  const map = asMap(files);
  const ignored = new Set(options.ignorePaths ?? []);
  /** @type {Map<string, string[]>} */
  const importedBy = new Map();

  for (const path of map.keys()) {
    if (!isScannableSource(path) || ignored.has(path)) continue;
    for (const target of resolvedImportsOf(path, map)) {
      const list = importedBy.get(target);
      if (list) {
        if (!list.includes(path)) list.push(path);
      } else {
        importedBy.set(target, [path]);
      }
    }
  }

  for (const list of importedBy.values()) list.sort();
  return importedBy;
}

/**
 * Archivos SUPERVIVIENTES que importan `target`. Vacío ⇒ nadie lo importa y el
 * borrado es seguro; no vacío ⇒ el archivo está vivo por mucho que su nombre se
 * parezca al de lo que se está eliminando.
 *
 * Superviviente = presente en `files` y NO listado en `ignorePaths` (los paths
 * que el propio plan borra). El propio `target` nunca cuenta como importador.
 *
 * @param {string} target
 * @param {Map<string,string>|Record<string,string>} files
 * @param {{ ignorePaths?: Iterable<string> }} [options]
 * @returns {string[]}
 */
export function importersOfPath(target, files, options = {}) {
  const map = asMap(files);
  const ignored = new Set(options.ignorePaths ?? []);
  ignored.add(target);

  const importers = [];
  for (const path of map.keys()) {
    if (!isScannableSource(path) || ignored.has(path)) continue;
    if (resolvedImportsOf(path, map).includes(target)) importers.push(path);
  }
  return importers.sort();
}

/**
 * Prefijos excluidos de las FILAS del bloque para el prompt: infraestructura que
 * el plan no puede borrar nunca (los primitivos de shadcn son decenas de
 * archivos y sólo serían ruido). Siguen apareciendo como importadores en la
 * columna derecha cuando lo son.
 */
export const PROMPT_ROW_EXCLUDED_PREFIXES = ['src/components/ui/', 'src/lib/'];

/** Nº máximo de filas en el bloque del prompt; el resto se declara truncado. */
export const PROMPT_ROW_LIMIT = 120;

/**
 * Bloque "importado por" para el prompt del Architect. Determinista y explícito
 * sobre los huérfanos: `(nobody)` es la ÚNICA evidencia válida de código muerto.
 *
 * @param {Map<string,string>|Record<string,string>} files
 * @param {{ excludePrefixes?: string[], limit?: number }} [options]
 * @returns {string} '' cuando no hay ningún archivo fuente que listar.
 */
export function buildImportedByBlock(files, options = {}) {
  const map = asMap(files);
  const excluded = options.excludePrefixes ?? PROMPT_ROW_EXCLUDED_PREFIXES;
  const limit = options.limit ?? PROMPT_ROW_LIMIT;
  const importedBy = buildImportedByMap(map);

  const rows = [];
  for (const path of [...map.keys()].sort()) {
    if (!isScannableSource(path)) continue;
    if (!path.startsWith('src/')) continue;
    if (excluded.some((p) => path.startsWith(p))) continue;
    const importers = importedBy.get(path) ?? [];
    rows.push(
      `${path} <- imported by: ${importers.length > 0 ? importers.join(', ') : '(nobody)'}`
    );
  }
  if (rows.length === 0) return '';

  const shown = rows.slice(0, limit);
  const omitted = rows.length - shown.length;
  return (
    'IMPORT GRAPH (deterministic — computed from the current file contents, not inferred). ' +
    'This is the ONLY valid evidence for the ORPHAN TEST: a file is dead code if and only if ' +
    'its importers are "(nobody)" or are themselves deleted by this plan.\n' +
    shown.join('\n') +
    (omitted > 0 ? `\n... (${omitted} more files omitted — treat them as NOT verifiable, do not delete them)` : '')
  );
}
