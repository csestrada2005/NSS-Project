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
// Formato "pretty" de tsc (terminal con colores): `src/x.tsx:99:15 - error TS2554: …`.
const TSC_PRETTY_LINE = /([\w@./\\-]+\.(?:tsx?|jsx?|mts|cts)):(\d+):(\d+) - error TS(\d+): (.*)$/;
// Códigos de color de terminal: invisibles en el panel, pero pueden llegar por la API.
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const TIME_PREFIX = /^\d{2}:\d{2}:\d{2}(?:\.\d+)? /;
const MAX_ERRORS = 100;

/** Texto de un evento, en las dos formas que documenta la API. */
function eventText(event) {
  if (!event || typeof event !== 'object') return '';
  const text = event.payload?.text ?? event.text;
  return typeof text === 'string' ? text : '';
}

/** Lista de eventos: un arreglo, o un objeto que lo envuelve ({ events: [...] }). */
function eventList(events) {
  if (Array.isArray(events)) return events;
  if (events && typeof events === 'object' && Array.isArray(events.events)) return events.events;
  return [];
}

/**
 * Cuerpo de /events como texto → eventos. La API responde como lista JSON o
 * como stream (`application/stream+json`: un JSON por línea).
 */
export function parseEventsBody(body) {
  const text = typeof body === 'string' ? body.trim() : '';
  if (!text) return [];
  try {
    return eventList(JSON.parse(text));
  } catch {
    return text.split('\n').flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
  }
}

/**
 * @param {unknown} events  respuesta JSON de /v3/deployments/{id}/events
 * @returns {{ file: string, line: number, column: number, code: number, message: string }[]}
 */
export function extractTypeErrorsFromBuildLog(events) {
  const lines = eventList(events)
    .flatMap((e) => eventText(e).split('\n'))
    .map((l) => l.replace(ANSI, '').replace(/\r$/, ''));
  const out = [];
  let current = null;
  for (const line of lines) {
    const m = TSC_LINE.exec(line) ?? TSC_PRETTY_LINE.exec(line);
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

/**
 * Pide el log de un deploy fallido y extrae los errores de tipos. Si no sale
 * ninguno, lo vuelve a pedir UNA vez tras `retryDelayMs`: el log puede no
 * estar completo en el instante en que Vercel marca ERROR. Nunca lanza, y
 * devuelve lo necesario para una línea de diagnóstico en Render.
 *
 * @param {{ url: string, token: string, fetchImpl?: typeof fetch, retryDelayMs?: number }} opts
 */
export async function fetchVercelTypeErrors({ url, token, fetchImpl = fetch, retryDelayMs = 2000 }) {
  let last = { status: null, events: 0, typeErrors: [], tail: '', error: null };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
    try {
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
      const events = res.ok ? parseEventsBody(await res.text()) : [];
      const text = events.map(eventText).join('\n').replace(ANSI, '');
      last = { status: res.status, events: events.length, typeErrors: extractTypeErrorsFromBuildLog(events), tail: text.slice(-300), error: null };
    } catch (err) {
      last = { ...last, error: err?.message ?? String(err) };
    }
    if (last.typeErrors.length > 0) break;
  }
  return last;
}

/** Línea de diagnóstico para los logs de Render. */
export function describeLogFetch({ status, events, typeErrors, tail, error }) {
  const base = `[deploy] log de Vercel: status ${status ?? '—'}, ${events} eventos, ${typeErrors.length} errores de tipos`;
  if (error) return `${base}; error: ${error}`;
  return typeErrors.length > 0 ? base : `${base}; final del log: ${JSON.stringify(tail)}`;
}
