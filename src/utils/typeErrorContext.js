// ---------------------------------------------------------------------------
// typeErrorContext — el código REAL de cada línea con error de tipos, dentro
// del pedido de "Arreglar ahora" (2026-10-01). Check de Samuel en Vertigo: el
// error decía "AdminUsersTable.tsx:366", pero la IA recibe los archivos SIN
// números de línea; adivinó dos veces y cambió otra parte del archivo. Con el
// renglón a la vista (y los de alrededor) sabe exactamente qué cambiar.
// ---------------------------------------------------------------------------

// "- src/x.tsx(366,9): TS2322 mensaje" — el formato de buildTypeFixPrompt.
const ERROR_LINE = /^- ([^\s(]+)\((\d+)(?:,\d+)?\): TS\d+/;
const RADIUS = 2;
const MAX_ERRORS_WITH_CONTEXT = 20;

/**
 * Las líneas `line ± radius` de `content`, numeradas, con `>` en la del error.
 *
 * @param {string} content
 * @param {number} line 1-based
 * @returns {string} '' si la línea no existe en el archivo
 */
export function codeAroundLine(content, line, radius = RADIUS) {
  if (typeof content !== 'string') return '';
  const lines = content.split('\n');
  if (!Number.isInteger(line) || line < 1 || line > lines.length) return '';
  const from = Math.max(1, line - radius);
  const to = Math.min(lines.length, line + radius);
  const width = String(to).length;
  const out = [];
  for (let n = from; n <= to; n++) {
    out.push(`    ${n === line ? '>' : ' '} ${String(n).padStart(width)} | ${lines[n - 1]}`);
  }
  return out.join('\n');
}

/**
 * Añade, debajo de cada error de la lista, el código de esa línea en el
 * proyecto actual, y una indicación para que cada paso cite el renglón exacto.
 * Lo que no encaja en el formato (o un archivo que no está) se deja tal cual.
 *
 * @param {string} prompt pedido de "Arreglar ahora"
 * @param {Map<string, string>} files proyecto actual
 * @returns {string}
 */
export function withTypeErrorContext(prompt, files) {
  let added = 0;
  const lines = String(prompt ?? '').split('\n').flatMap((text) => {
    const m = ERROR_LINE.exec(text);
    if (!m || added >= MAX_ERRORS_WITH_CONTEXT) return [text];
    const snippet = codeAroundLine(files?.get(m[1]), Number(m[2]));
    if (!snippet) return [text];
    added++;
    return [text, snippet];
  });
  if (added === 0) return String(prompt ?? '');
  lines.push(
    '',
    'The line marked with ">" is the exact code that fails. Change THAT code (or the type it uses), ' +
      'and in each step description quote the exact line to change and its replacement.'
  );
  return lines.join('\n');
}
