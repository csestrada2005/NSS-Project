/**
 * resolveModulePath — resolución de un specifier de import a los paths del
 * proyecto, con la MISMA política que el plugin virtual del compilador
 * (server/compiler.js: alias '@/' → 'src/', relativos contra el directorio del
 * importador, extensiones .tsx/.ts/.jsx/.js e index).
 *
 * POR QUÉ EXISTE
 * --------------
 * Cuando un delete excesivo borra un módulo que otros archivos siguen
 * importando, el compile falla con `Cannot resolve "@/components/X" from
 * "src/pages/Index.tsx"`. El texto del error es la ÚNICA pista del archivo que
 * falta, y llega como specifier (alias, sin extensión), no como path del
 * proyecto. El Verifier necesita traducirlo para poder declarar ese path
 * escribible por la reparación: sin eso, el bloque que el modelo devuelve
 * recreando el archivo se descarta y el siguiente compile repite el error.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * groupCompileErrors.js. El tipado vive en resolveModulePath.d.ts.
 */

/** Extensiones que el resolver del compilador prueba para un specifier sin extensión. */
export const MODULE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'];

/**
 * Normaliza un path posix ('a/b/../c' → 'a/c'). Sin dependencias de node: este
 * módulo corre en el navegador.
 *
 * @param {string} p
 * @returns {string}
 */
export function normalizePath(p) {
  const out = [];
  for (const seg of String(p ?? '').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

/**
 * Paths de proyecto que el compilador habría probado para `raw` importado desde
 * `importer`. Devuelve [] para cualquier segmento que no sea una ruta del
 * proyecto (nombres de import como "default", paquetes bare como "react",
 * texto suelto del mensaje de error).
 *
 * @param {string} raw       Specifier tal como aparece entrecomillado en el error.
 * @param {string|null} importer  Path del archivo que hace el import.
 * @returns {string[]}
 */
export function candidatePathsFor(raw, importer) {
  const spec = String(raw ?? '').trim();
  if (!spec || /\s/.test(spec)) return [];

  let base;
  if (spec.startsWith('@/')) {
    base = 'src/' + spec.slice(2);
  } else if (spec.startsWith('./') || spec.startsWith('../')) {
    if (!importer) return [];
    const dir = importer.includes('/') ? importer.slice(0, importer.lastIndexOf('/')) : '';
    base = normalizePath(`${dir}/${spec}`);
  } else if (spec.startsWith('src/')) {
    base = normalizePath(spec);
  } else {
    return [];
  }

  if (!base) return [];
  // Ya trae extensión: el compilador la usa tal cual, no prueba variantes.
  if (/\.[a-z]{2,4}$/i.test(base)) return [base];

  return [
    ...MODULE_EXTENSIONS.map((e) => base + e),
    ...MODULE_EXTENSIONS.map((e) => `${base}/index${e}`),
  ];
}
