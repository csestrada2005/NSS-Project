// ---------------------------------------------------------------------------
// exportShapeFix — reparación SIN IA de "No matching export in X for import Y"
// cuando el símbolo existe en X pero con la otra forma (2026-10-08).
//
// Caso de producción (Vertigo): Index importaba `{ PricingSection }` y el
// archivo lo entregaba como `export default`. Haiku reescribió la sección
// entera para arreglarlo y le cambió el diseño (metió pestañas de plantilla).
// El arreglo correcto es UNA línea al final de X; nada más del archivo cambia.
// Si el caso no encaja con seguridad, no se toca nada y sigue el modelo.
// ---------------------------------------------------------------------------

const MISSING_EXPORT = /No matching export in "(?:virtual:)?([^"]+)" for import "([^"]+)"/;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** ¿X declara `name` en su nivel superior (función, clase, const/let/var)? */
function declares(source, name) {
  const n = escape(name);
  return new RegExp(
    `^(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?(?:function\\s*\\*?\\s*${n}\\b|class\\s+${n}\\b|(?:const|let|var)\\s+${n}\\b)`,
    'm'
  ).test(source);
}

/** Nombres exportados con nombre (`export function A`, `export const A`, `export { A, B as C }`). */
function namedExports(source) {
  const out = new Set();
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function\s*\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
    out.add(m[1]);
  }
  for (const m of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const alias = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (alias && alias !== 'default') out.add(alias);
    }
  }
  return out;
}

/** Nombre del export default si es un identificador (`export default function A`, `export default A;`). */
function defaultExportName(source) {
  const decl = /^export\s+default\s+(?:async\s+)?(?:function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/m.exec(source);
  if (decl) return decl[1];
  const ident = /^export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m.exec(source);
  return ident ? ident[1] : null;
}

const hasDefault = (source) => /^export\s+default\b/m.test(source) || /^export\s*\{[^}]*\bas\s+default\b/m.test(source);

/**
 * La línea que hay que añadir a `source` para que exporte `importName`, o null
 * si no se puede saber con seguridad.
 * @param {string} source
 * @param {string} importName  "default" o el nombre importado.
 * @returns {string|null}
 */
export function exportLineFor(source, importName) {
  if (importName === 'default') {
    if (hasDefault(source)) return null;
    // Un único componente exportado con nombre: ése es el default que faltaba.
    const candidates = [...namedExports(source)].filter((n) => /^[A-Z]/.test(n));
    return candidates.length === 1 ? `export default ${candidates[0]};` : null;
  }
  if (namedExports(source).has(importName)) return null;
  // El símbolo está declarado (p. ej. `export default function PricingSection`).
  if (declares(source, importName)) return `export { ${importName} };`;
  // Default con otro nombre de componente: se reexporta con el nombre pedido.
  const def = defaultExportName(source);
  if (def && /^[A-Z]/.test(importName) && declares(source, def) && namedExports(source).size === 0) {
    return `export { ${def} as ${importName} };`;
  }
  return null;
}

/**
 * Intenta reparar TODO el lote sin modelo. Sólo devuelve archivos si cada
 * error del lote es de este tipo y tiene arreglo seguro; si no, null y el
 * lote sigue su camino normal.
 * @param {{ errors: { message?: string|null }[] }} batch
 * @param {Map<string, string>} files
 * @param {Iterable<string>} protectedPaths  Restaurados: no se tocan.
 * @returns {{ files: Map<string, string>, fixes: string[] } | null}
 */
export function planExportShapeFix(batch, files, protectedPaths = []) {
  const locked = new Set(protectedPaths);
  const additions = new Map();
  const fixes = [];
  if (!batch?.errors?.length) return null;
  for (const err of batch.errors) {
    const m = MISSING_EXPORT.exec(err.message ?? '');
    if (!m) return null;
    const [, path, importName] = m;
    const source = files.get(path);
    if (source == null || locked.has(path)) return null;
    const pending = additions.get(path) ?? [];
    const line = exportLineFor(source + (pending.length ? '\n' + pending.join('\n') : ''), importName);
    if (!line) {
      // Otro error del lote ya pudo añadir este mismo export.
      if (pending.some((l) => l.includes(importName))) continue;
      return null;
    }
    pending.push(line);
    additions.set(path, pending);
    fixes.push(`${path} +${line}`);
  }
  if (fixes.length === 0) return null;
  const next = new Map(files);
  for (const [path, lines] of additions) {
    const source = files.get(path);
    next.set(path, `${source.replace(/\s*$/, '')}\n\n${lines.join('\n')}\n`);
  }
  return { files: next, fixes };
}
