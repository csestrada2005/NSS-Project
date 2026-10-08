import { Fragment, type ReactNode } from 'react';

/**
 * Markdown mínimo para las respuestas de la IA en el chat: párrafos, listas con
 * "- " / "* " y, dentro de una línea, **negrita** y `código`. Es lo que pide el
 * prompt de preguntas (sin encabezados ni emojis). Construye nodos de React —
 * nunca HTML crudo — así que el texto del modelo no puede inyectar marcado.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith('**')) out.push(<strong key={`${keyBase}-b${i++}`}>{token.slice(2, -2)}</strong>);
    else out.push(<code key={`${keyBase}-c${i++}`} className="fc-inline-code">{token.slice(1, -1)}</code>);
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Fila separadora de una tabla markdown: |---|:--:|---| */
const TABLE_SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
const tableCells = (line: string) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function MiniMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  // Tablas (2026-10-08, Samuel: "dame los precios en una tabla" salía con
  // barras). Con fila separadora, la primera fila es el encabezado.
  let table: string[] = [];
  const flushTable = () => {
    if (table.length === 0) return;
    const k = `t${blocks.length}`;
    const hasHeader = table.length >= 2 && TABLE_SEPARATOR.test(table[1].trim());
    const head = hasHeader ? tableCells(table[0]) : null;
    const body = (hasHeader ? table.slice(2) : table)
      .filter((l) => !TABLE_SEPARATOR.test(l.trim()))
      .map(tableCells);
    blocks.push(
      <div key={k} className="fc-tabla-wrap">
        <table className="fc-tabla">
          {head && (
            <thead>
              <tr>{head.map((c, i) => <th key={i}>{inline(c, `${k}-h${i}`)}</th>)}</tr>
            </thead>
          )}
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>{row.map((c, i) => <td key={i}>{inline(c, `${k}-${r}-${i}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    table = [];
  };
  const flushPara = () => {
    if (para.length === 0) return;
    const k = `p${blocks.length}`;
    blocks.push(
      <p key={k}>
        {para.map((line, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            {inline(line, `${k}-${i}`)}
          </Fragment>
        ))}
      </p>
    );
    para = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    const k = `l${blocks.length}`;
    blocks.push(
      <ul key={k}>
        {list.map((item, i) => <li key={i}>{inline(item, `${k}-${i}`)}</li>)}
      </ul>
    );
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim().startsWith('|')) {
      flushPara();
      flushList();
      table.push(line);
      continue;
    }
    flushTable();
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) {
      flushPara();
      list.push(item[1]);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  flushTable();
  return <div className="fc-markdown">{blocks}</div>;
}
