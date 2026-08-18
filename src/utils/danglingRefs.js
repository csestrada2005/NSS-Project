/**
 * danglingRefs — escaneo DETERMINISTA de referencias vivas a un archivo que el
 * plan acaba de borrar. Sin modelo, sin red.
 *
 * POR QUÉ EXISTE
 * --------------
 * "Elimina la página Menú" produjo un diff de src/App.tsx que quitó el import de
 * Menu pero dejó `<Menu />` en el JSX. esbuild NO reporta identificadores no
 * definidos —no es un error de compilación, es un ReferenceError en runtime—,
 * así que el verify pasó en verde, los deletes persistieron y el preview reventó
 * con "Menu is not defined". Segunda aparición del patrón "diff corto de App.tsx
 * en el descableado".
 *
 * El compilador cubre UNA de las dos formas del descableado incompleto: si el
 * import sobrevive, el módulo ausente no resuelve y el compile falla. La otra
 * —el import se va y el USO se queda— es invisible para él. Este módulo es la
 * red determinista para ambas:
 *
 *   (a) IMPORT COLGANTE: un superviviente importa un specifier cuyos candidatos
 *       incluyen el path borrado y ninguno existe ya. Redundante con el compile
 *       en el caso normal, pero no cuando esbuild elide el import (un `import
 *       type`, o un nombre usado sólo en posición de tipo).
 *   (b) SÍMBOLO COLGANTE: un superviviente usa un nombre que EXPORTABA el
 *       archivo borrado y que no tiene ninguna ligadura en ese superviviente.
 *       Ésta es la forma exacta del incidente.
 *
 * PRECISIÓN ANTES QUE COBERTURA
 * -----------------------------
 * Un falso positivo tumba el intent entero (fail-closed: el verify se pone rojo
 * y los deletes se revierten), así que el escaneo está sesgado a NO disparar:
 * enmascara comentarios, literales de cadena/plantilla y texto JSX en prosa
 * antes de buscar, y trata como "ligado" cualquier nombre que aparezca en una
 * posición declarativa (import, declaración, desestructuración, parámetro). Un
 * nombre ligado nunca se reporta. Preferimos un falso negativo —el bug de hoy,
 * que ya teníamos— a romper un intent legítimo.
 *
 * NO CITAR PATHS ENTRECOMILLADOS EN EL MENSAJE
 * --------------------------------------------
 * Los mensajes sintéticos que produce `syntheticDanglingErrors` NO llevan
 * comillas. Es deliberado y load-bearing: `deterministicRestore.scanErrorRefs`
 * trata todo segmento entrecomillado del mensaje como candidato a specifier, y
 * un path borrado que resuelva por ahí se REPONE byte a byte desde el mapa
 * previo — deshaciendo justo el borrado que el usuario pidió. El path del
 * archivo borrado viaja sin comillas; la línea ofensora va en `lineText`, que
 * ese escaneo no mira.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * importGraph.js y deterministicRestore.js. El tipado vive en danglingRefs.d.ts.
 */

import { candidatePathsFor } from './resolveModulePath.js';
import { extractSpecifiers, SOURCE_EXTENSIONS } from './importGraph.js';

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

/** Reemplaza [from, to) por espacios, conservando los saltos de línea. */
function blankOut(chars, from, to) {
  for (let i = from; i < to && i < chars.length; i++) {
    if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
  }
}

/**
 * Enmascara comentarios y literales de cadena/plantilla, sustituyendo su
 * contenido por espacios. CONSERVA la longitud y los saltos de línea, así que
 * los offsets del resultado siguen valiendo sobre el original — de ahí salen el
 * número de línea y el texto exactos que se le enseñan al modelo.
 *
 * Dentro de una plantilla, los tramos `${...}` se conservan: son código.
 *
 * @param {string} content
 * @returns {string}
 */
export function maskLiterals(content) {
  const src = String(content ?? '');
  const chars = [...src];
  let i = 0;
  const n = chars.length;

  while (i < n) {
    const c = chars[i];
    const next = chars[i + 1];

    // Comentario de línea.
    if (c === '/' && next === '/') {
      let j = i + 2;
      while (j < n && chars[j] !== '\n') j++;
      blankOut(chars, i, j);
      i = j;
      continue;
    }
    // Comentario de bloque.
    if (c === '/' && next === '*') {
      let j = i + 2;
      while (j < n && !(chars[j] === '*' && chars[j + 1] === '/')) j++;
      blankOut(chars, i, Math.min(j + 2, n));
      i = Math.min(j + 2, n);
      continue;
    }
    // Cadena simple o doble: se enmascara el interior, se dejan las comillas.
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && chars[j] !== c) {
        if (chars[j] === '\\') j++;
        if (chars[j] === '\n') break; // cadena sin cerrar: no nos comemos el archivo
        j++;
      }
      blankOut(chars, i + 1, j);
      i = Math.min(j + 1, n);
      continue;
    }
    // Plantilla: se enmascara el texto, se conservan los `${ ... }`.
    if (c === '`') {
      let j = i + 1;
      while (j < n && chars[j] !== '`') {
        if (chars[j] === '\\') { j += 2; continue; }
        if (chars[j] === '$' && chars[j + 1] === '{') {
          // Saltar la expresión (con anidamiento de llaves) sin tocarla.
          let depth = 1;
          let k = j + 2;
          while (k < n && depth > 0) {
            if (chars[k] === '{') depth++;
            else if (chars[k] === '}') depth--;
            k++;
          }
          j = k;
          continue;
        }
        chars[j] = chars[j] === '\n' || chars[j] === '\r' ? chars[j] : ' ';
        j++;
      }
      i = Math.min(j + 1, n);
      continue;
    }
    i++;
  }

  return chars.join('');
}

/**
 * Tramo de texto JSX en PROSA: lo que va entre un `>` y el siguiente `<` sin
 * ningún carácter de código. `<p>Menu</p>` deja de contar como uso de Menu;
 * `{count > total && <X/>}` (el tramo lleva `&`) se conserva intacto.
 *
 * Conserva longitud y saltos de línea, igual que maskLiterals.
 */
const JSX_TEXT_RE = /(>)([^<>{}();=&|?:!/\\[\]`"']*)(<)/g;

/**
 * Enmascara literales, comentarios y texto JSX en prosa. El resultado tiene la
 * MISMA longitud que la entrada.
 *
 * @param {string} content
 * @returns {string}
 */
export function maskNonCode(content) {
  const masked = maskLiterals(content);
  return masked.replace(JSX_TEXT_RE, (m, open, text, close) =>
    open + text.replace(/[^\n\r]/g, ' ') + close
  );
}

/** Identificadores sueltos de un fragmento (usado para desestructuración y params). */
function identifiersIn(fragment) {
  const out = [];
  for (const m of String(fragment ?? '').matchAll(/[A-Za-z_$][\w$]*/g)) out.push(m[0]);
  return out;
}

/**
 * Nombres LIGADOS en un archivo: todo lo que tenga una declaración local o
 * llegue por un import. Generoso a propósito — cada nombre de más aquí sólo
 * puede evitar un reporte, nunca provocarlo.
 *
 * @param {string} content  Contenido ya enmascarado (maskNonCode).
 * @returns {Set<string>}
 */
export function boundNames(content) {
  const src = String(content ?? '');
  const out = new Set();

  // Cláusulas de import: `import X, { A, B as C } from ...`, `import * as NS from ...`.
  for (const m of src.matchAll(/\bimport\s+(?:type\s+)?([^;]*?)\s+from\s+/g)) {
    for (const name of identifiersIn(m[1].replace(/\btype\b/g, ''))) out.add(name);
  }
  // Declaraciones con nombre.
  for (const m of src.matchAll(
    /\b(?:function|class|const|let|var|type|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)/g
  )) {
    out.add(m[1]);
  }
  // Desestructuración: `const { a, b: c } = ...`, `const [x, y] = ...`.
  for (const m of src.matchAll(/\b(?:const|let|var)\s*(\{[^}]*\}|\[[^\]]*\])/g)) {
    for (const name of identifiersIn(m[1])) out.add(name);
  }
  // Parámetros de función/flecha. Deliberadamente amplio.
  for (const m of src.matchAll(/\(([^()]*)\)\s*(?:=>|\{|:)/g)) {
    for (const name of identifiersIn(m[1])) out.add(name);
  }
  // `catch (e)`, `for (const x of ...)` ya caen en los anteriores.

  return out;
}

/** Palabras que nunca son un símbolo exportado aunque casen con el regex. */
const NOT_A_SYMBOL = new Set([
  'default', 'function', 'class', 'const', 'let', 'var', 'type', 'interface',
  'enum', 'async', 'new', 'await', 'from', 'as',
]);

/**
 * Símbolos que EXPORTA el contenido de un archivo, extraídos de forma
 * determinista. Incluye:
 *  - exports con nombre (`export const X`, `export function X`, `export { A as B }`)
 *  - el nombre DECLARADO del export por defecto (`export default function Menu`,
 *    `export default Menu;`) — el consumidor elige el suyo, pero por convención
 *    (y por el PAGE EXPORT CONTRACT del Implementer: un archivo de src/pages/
 *    termina en `export default <PageName>`) usa ése.
 *  - el basename PascalCase del archivo cuando hay export por defecto anónimo o
 *    el nombre declarado no coincide: `src/pages/Menu.tsx` → `Menu`.
 *
 * @param {string} content
 * @param {string} [path]  Path del archivo, para el basename del default.
 * @returns {string[]} Ordenados y sin duplicados.
 */
export function exportedSymbols(content, path) {
  const src = maskNonCode(content);
  const out = new Set();

  // export [default] [async] function|class Nombre
  for (const m of src.matchAll(
    /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g
  )) {
    out.add(m[1]);
  }
  // export [declare] const|let|var|type|interface|enum Nombre
  for (const m of src.matchAll(
    /\bexport\s+(?:declare\s+)?(?:const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g
  )) {
    out.add(m[1]);
  }
  // export default Nombre;  (identificador suelto, no una keyword)
  for (const m of src.matchAll(/\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*;/g)) {
    if (!NOT_A_SYMBOL.has(m[1])) out.add(m[1]);
  }
  // export { A, B as C }  → el nombre EXTERNO es el que escribe el consumidor;
  // `X as default` aporta X, que es el nombre convencional del default.
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const entry of m[1].split(',')) {
      const parts = entry.trim().split(/\s+as\s+/);
      if (parts.length === 0 || !parts[0]) continue;
      const local = parts[0].trim().replace(/^type\s+/, '');
      const external = (parts[1] ?? local).trim();
      if (external === 'default') {
        if (local && !NOT_A_SYMBOL.has(local)) out.add(local);
      } else if (external && !NOT_A_SYMBOL.has(external)) {
        out.add(external);
      }
    }
  }

  // Basename PascalCase cuando el archivo tiene export por defecto: cubre el
  // `export default function () {}` anónimo y el default renombrado.
  const hasDefaultExport =
    /\bexport\s+default\b/.test(src) || /\bexport\s*\{[^}]*\bas\s+default\b/.test(src);
  if (typeof path === 'string' && hasDefaultExport) {
    const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    if (/^[A-Z][A-Za-z0-9_$]*$/.test(base)) out.add(base);
  }

  return [...out].sort();
}

/**
 * Primera aparición de `symbol` USADO como código en `masked`: etiqueta JSX
 * (`<Symbol`, `</Symbol`) o identificador con frontera de palabra. Devuelve el
 * offset o -1.
 */
function findSymbolUse(masked, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`</?\\s*${escaped}\\b|\\b${escaped}\\b`, 'g');
  const m = re.exec(masked);
  return m ? m.index : -1;
}

/** Línea (1-indexada) y texto de la línea que contiene `offset`. */
function locate(content, offset) {
  const before = content.slice(0, offset);
  const line = before.split('\n').length;
  const start = before.lastIndexOf('\n') + 1;
  const endRel = content.indexOf('\n', offset);
  const end = endRel === -1 ? content.length : endRel;
  return { line, lineText: content.slice(start, end).trim() };
}

/**
 * Import de `survivor` cuyos candidatos incluyen `deleted` y que ya no resuelve
 * a ningún archivo del proyecto. null si no hay ninguno.
 */
function danglingImportOf(survivor, content, deleted, map) {
  for (const spec of extractSpecifiers(content)) {
    const candidates = candidatePathsFor(spec, survivor);
    if (candidates.length === 0) continue;
    if (!candidates.includes(deleted)) continue;
    if (candidates.some((c) => map.has(c))) continue; // resuelve a otro archivo vivo
    const at = content.indexOf(spec);
    return at === -1 ? { line: null, lineText: null, spec } : { ...locate(content, at), spec };
  }
  return null;
}

/**
 * REFERENCIAS VIVAS a los archivos que este intent borró.
 *
 * `deletedPaths` se filtra a los que de verdad están ausentes del mapa vivo y
 * existían en el previo: un delete que el repair ya revirtió (restaurado o
 * recreado) vuelve a estar presente y deja de ser un borrado.
 *
 * Como mucho UN hallazgo por par (borrado, superviviente): el modelo recibe el
 * archivo entero de todas formas, y el mensaje enumera todos los símbolos
 * colgantes de ese par.
 *
 * @param {Iterable<string>} deletedPaths
 * @param {Map<string,string>|Record<string,string>} files      Mapa VIVO (deletes ya aplicados).
 * @param {Map<string,string>|Record<string,string>} originalFiles  Mapa PREVIO al intent.
 * @returns {{ deleted: string, survivor: string, kind: 'import'|'symbol', symbols: string[], line: number|null, lineText: string|null }[]}
 */
export function findDanglingRefs(deletedPaths, files, originalFiles) {
  const map = asMap(files);
  const universe = asMap(originalFiles);

  const deleted = [...new Set(deletedPaths ?? [])].filter(
    (p) => typeof p === 'string' && p && !map.has(p) && universe.has(p)
  );
  if (deleted.length === 0) return [];

  const survivors = [...map.keys()].filter(isScannableSource).sort();
  /** @type {Map<string, string>} */
  const maskedCache = new Map();
  /** @type {Map<string, Set<string>>} */
  const boundCache = new Map();
  const maskedOf = (path) => {
    let m = maskedCache.get(path);
    if (m === undefined) {
      m = maskNonCode(map.get(path) ?? '');
      maskedCache.set(path, m);
    }
    return m;
  };
  const boundOf = (path) => {
    let b = boundCache.get(path);
    if (b === undefined) {
      b = boundNames(maskedOf(path));
      boundCache.set(path, b);
    }
    return b;
  };

  const out = [];

  for (const del of deleted.sort()) {
    const symbols = exportedSymbols(universe.get(del), del);

    for (const survivor of survivors) {
      const content = map.get(survivor) ?? '';

      // (a) IMPORT COLGANTE — tiene prioridad: es la referencia más explícita.
      const imp = danglingImportOf(survivor, content, del, map);
      if (imp) {
        out.push({
          deleted: del,
          survivor,
          kind: 'import',
          symbols,
          line: imp.line,
          lineText: imp.lineText,
        });
        continue;
      }

      // (b) SÍMBOLO COLGANTE — exportado por el borrado, usado aquí, sin ligadura.
      const masked = maskedOf(survivor);
      const bound = boundOf(survivor);
      const hits = [];
      let firstAt = -1;
      for (const sym of symbols) {
        if (bound.has(sym)) continue;
        const at = findSymbolUse(masked, sym);
        if (at === -1) continue;
        hits.push(sym);
        if (firstAt === -1 || at < firstAt) firstAt = at;
      }
      if (hits.length === 0) continue;

      const where = locate(content, firstAt);
      out.push({
        deleted: del,
        survivor,
        kind: 'symbol',
        symbols: hits,
        line: where.line,
        lineText: where.lineText,
      });
    }
  }

  return out;
}

/**
 * Errores de verificación SINTÉTICOS a partir de los hallazgos, con la forma
 * que consume el ciclo de reparación existente (groupCompileErrors → fixBatch).
 *
 * El mensaje NO lleva comillas: ver la nota de cabecera. Y dice explícitamente
 * que el borrado es intencional y que la reparación correcta es descablear al
 * consumidor — sin eso, el contrato no destructivo del fixBatch (regla 2:
 * "NEVER DELETE TO SILENCE AN ERROR", regla 4: "AN ABSENT MODULE IS RECREATED")
 * empujaría al modelo a recrear justo el archivo que el usuario mandó borrar.
 *
 * @param {ReturnType<typeof findDanglingRefs>} refs
 * @returns {{ message: string, file: string, line: number|null, lineText: string|null }[]}
 */
export function syntheticDanglingErrors(refs) {
  return (refs ?? []).map((ref) => {
    const what = ref.kind === 'import'
      ? `still imports it`
      : `still references ${ref.symbols.length === 1 ? 'the symbol' : 'the symbols'} ${ref.symbols.join(', ')} that it exported`;
    const symbolPart = ref.kind === 'import'
      ? (ref.symbols.length > 0
          ? ` Symbols it exported: ${ref.symbols.join(', ')}.`
          : '')
      : '';
    return {
      message:
        `deleted file ${ref.deleted} still referenced by ${ref.survivor}: ` +
        `${ref.survivor} ${what}` +
        (ref.line != null ? ` at line ${ref.line}` : '') + `.` +
        ` The deletion of ${ref.deleted} was requested by the user and is FINAL:` +
        ` do NOT recreate it, and do NOT write any replacement module at that path` +
        ` or anywhere else.${symbolPart}` +
        ` The only correct repair is to UNWIRE ${ref.survivor}: remove the dangling` +
        ` import, the route, the JSX usage and any binding, prop or handler left` +
        ` unused by their removal — this is the last-resort case of rule 5, so emit` +
        ` the ===REPAIR-NOTE=== line for it. Everything else in ${ref.survivor}` +
        ` must stay byte-for-byte as it is: this is a surgical unwiring, not a rewrite.`,
      file: ref.survivor,
      line: ref.line,
      lineText: ref.lineText,
    };
  });
}

/**
 * Sufijo de telemetría para forge_intent_log. Mismo patrón que [PARTIAL:...],
 * [DELETE_REJECTED:...] y [RESTORED:...] — sufijo en el prompt, sin tocar
 * columnas ni enums. Cadena vacía cuando el escaneo no disparó, así que el log
 * de siempre no cambia.
 *
 * @param {{ deleted: string, survivor: string }[]} refs
 * @returns {string}
 */
export function danglingRefsTelemetry(refs) {
  if (!refs || refs.length === 0) return '';
  const pairs = [];
  for (const ref of refs) {
    const pair = `${ref.deleted}->${ref.survivor}`;
    if (!pairs.includes(pair)) pairs.push(pair);
  }
  return ` [DANGLING_REF:${pairs.join(',')}]`;
}
