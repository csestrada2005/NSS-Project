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

export function MiniMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
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
  return <div className="fc-markdown">{blocks}</div>;
}
