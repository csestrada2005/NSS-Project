// ---------------------------------------------------------------------------
// vercelBuildLog — errores de tipos desde el log de build de Vercel
// (2026-09-30). En Render (512 MB) la revisión de tipos del servidor no cabe
// en memoria; decisión de Samuel: que Vercel sea el revisor al publicar. Si su
// build falla, se lee el log (GET /v3/deployments/{id}/events) y se extraen
// las líneas de `tsc`, con el mismo formato que server/typecheck.js, para que
// Wyrd las muestre y "Arreglar ahora" se las mande a la IA.
// ---------------------------------------------------------------------------

// `src/x.tsx(99,15): error TS2554: Expected 2 arguments, but got 1.`
// Tolera un prefijo (hora, etiqueta) delante de la ruta.
const TSC_LINE = /([\w@./\\-]+\.(?:tsx?|jsx?|mts|cts))\((\d+),(\d+)\): error TS(\d+): (.*)$/;
const TIME_PREFIX = /^\d{2}:\d{2}:\d{2}(?:\.\d+)? /;
const MAX_ERRORS = 100;

/** Texto de un evento, en las dos formas que documenta la API. */
function eventText(event) {
  if (!event || typeof event !== 'object') return '';
  const text = event.payload?.text ?? event.text;
  return typeof text === 'string' ? text : '';
}

/**
 * @param {unknown} events  respuesta JSON de /v3/deployments/{id}/events
 * @returns {{ file: string, line: number, column: number, code: number, message: string }[]}
 */
export function extractTypeErrorsFromBuildLog(events) {
  const lines = (Array.isArray(events) ? events : [])
    .flatMap((e) => eventText(e).split('\n'))
    .map((l) => l.replace(/\r$/, ''));
  const out = [];
  let current = null;
  for (const line of lines) {
    const m = TSC_LINE.exec(line);
    if (m) {
      current = {
        file: m[1].replace(/\\/g, '/').replace(/^\/vercel\/path\d+\//, ''),
        line: Number(m[2]),
        column: Number(m[3]),
        code: Number(m[4]),
        message: m[5].trim(),
      };
      out.push(current);
      if (out.length >= MAX_ERRORS) break;
      continue;
    }
    // Detalle indentado bajo un error de tsc ("  Type 'X' is not comparable…").
    // La hora del panel ("15:50:16.219 ") se quita con UN espacio: la sangría
    // que sigue es la que marca el detalle.
    const body = line.replace(TIME_PREFIX, '');
    if (current && /^\s{2,}\S/.test(body)) {
      current.message += '\n' + body.trim();
      continue;
    }
    current = null;
  }
  return out;
}
