// ---------------------------------------------------------------------------
// searchReplace — ediciones simples como cambios exactos, no archivo entero
// (bucket 6, 2026-09-30). Medición de Samuel en Vertigo: 47 de 86 s eran
// Sonnet reescribiendo un archivo completo para cambiar una clase. Decisión
// de Samuel: el archivo entero SÓLO si el usuario lo pide o si es
// imprescindible; antes, un ciclo de intentos de cambios exactos (más barato).
//
// Formato que devuelve el modelo (uno o varios bloques):
//   <<<<<<< SEARCH
//   texto exacto del archivo
//   =======
//   texto nuevo
//   >>>>>>> REPLACE
// ---------------------------------------------------------------------------

const BLOCK = /<{7} SEARCH\r?\n([\s\S]*?)\r?\n={7}\r?\n([\s\S]*?)\r?\n?>{7} REPLACE/g;

/** Bloques SEARCH/REPLACE de la respuesta del modelo ([] si no hay). */
export function parseEditBlocks(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(BLOCK)) {
    out.push({ search: m[1], replace: m[2] });
  }
  return out;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let pos = haystack.indexOf(needle);
  while (pos !== -1) {
    count++;
    pos = haystack.indexOf(needle, pos + needle.length);
  }
  return count;
}

/**
 * Coincidencia tolerante a la sangría: las líneas del SEARCH, sin espacios al
 * inicio/fin, contra ventanas de líneas del archivo. Devuelve los rangos
 * [inicio, fin) en caracteres de cada ventana que coincide.
 */
function trimmedLineMatches(content, search) {
  const wanted = search.split('\n').map((l) => l.trim());
  while (wanted.length && wanted[wanted.length - 1] === '') wanted.pop();
  while (wanted.length && wanted[0] === '') wanted.shift();
  if (wanted.length === 0) return [];
  const lines = content.split('\n');
  const starts = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const out = [];
  for (let i = 0; i + wanted.length <= lines.length; i++) {
    let ok = true;
    for (let j = 0; j < wanted.length; j++) {
      if (lines[i + j].trim() !== wanted[j]) { ok = false; break; }
    }
    if (ok) {
      const last = i + wanted.length - 1;
      out.push([starts[i], starts[last] + lines[last].length]);
    }
  }
  return out;
}

/**
 * Aplica los bloques en orden. Todo o nada: si algún bloque no encaja
 * (no aparece, o aparece más de una vez), no se aplica ninguno y se dice
 * cuáles fallaron, para el siguiente intento.
 *
 * @returns {{ content: string | null, failures: { index: number, reason: 'not-found' | 'ambiguous', count: number }[] }}
 */
export function applyEditBlocks(content, blocks) {
  let current = String(content ?? '');
  const failures = [];
  blocks.forEach((block, index) => {
    const exact = countOccurrences(current, block.search);
    if (exact === 1) {
      current = current.replace(block.search, () => block.replace);
      return;
    }
    if (exact > 1) {
      failures.push({ index, reason: 'ambiguous', count: exact });
      return;
    }
    const loose = trimmedLineMatches(current, block.search);
    if (loose.length === 1) {
      const [start, end] = loose[0];
      current = current.slice(0, start) + block.replace + current.slice(end);
      return;
    }
    failures.push({ index, reason: loose.length > 1 ? 'ambiguous' : 'not-found', count: loose.length });
  });
  return { content: failures.length === 0 ? current : null, failures };
}

/** Mensaje para el modelo con los bloques que no encajaron. */
export function describeFailures(failures, blocks) {
  const lines = failures.map((f) => {
    const preview = blocks[f.index]?.search.split('\n').slice(0, 3).join('\n') ?? '';
    return f.reason === 'ambiguous'
      ? `- Block ${f.index + 1}: its SEARCH text appears ${f.count} times in the file. Include more surrounding lines so it matches exactly once.\n${preview}`
      : `- Block ${f.index + 1}: its SEARCH text does not appear in the file. Copy it character by character from the CONTENT above.\n${preview}`;
  });
  return (
    'None of your edits were applied, because these blocks did not match:\n' +
    lines.join('\n') +
    '\nSend ALL the blocks again (the ones that matched too), in the same format.'
  );
}

// El usuario pide rehacer el archivo: entonces sí, archivo completo.
const FULL_REWRITE =
  /\b(reescrib\w*|rehaz\w*|rehacer|desde cero|de nuevo (?:todo|toda|el archivo|la secci[oó]n)|rewrite|redo|from scratch|start over)\b/i;

export function wantsFullRewrite(input) {
  return FULL_REWRITE.test(String(input ?? ''));
}
