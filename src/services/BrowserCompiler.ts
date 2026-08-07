/**
 * BrowserCompiler — delegates TypeScript/JSX compilation to the server.
 *
 * The compile() function now POSTs the files map to /api/compile and returns
 * the server-generated HTML string. The function signature is unchanged so
 * all callers (StudioEngine.tsx) work without modification.
 *
 * NOTE: src/utils/ast.ts still uses @babel/standalone client-side for the
 * visual editor overlay features and must NOT be changed.
 */

import { SupabaseService } from './SupabaseService';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile all project files into a self-contained HTML string for srcdoc.
 * Delegates to /api/compile on the server.
 * Returns an error page if compilation or the fetch itself fails.
 */
function generateLoadingHTML(): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <style>',
    '    body { background: #0a0a0f; margin: 0; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: system-ui; }',
    '    .dot { width: 12px; height: 12px; background-color: #E54D5B; border-radius: 50%; animation: pulse 1s ease-in-out infinite; }',
    '    .text { color: white; font-size: 14px; margin-top: 12px; }',
    '    @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="dot"></div>',
    '  <div class="text">Initializing project...</div>',
    '</body>',
    '</html>'
  ].join('\n');
}

// Nº de intentos y backoff exponencial para errores de RED del cliente (no del
// servidor de compilación). Un fallo de red no lo arregla el AI, así que en vez
// de mentir con "The AI will auto-fix this" reintentamos y, si sigue cayendo,
// mostramos un estado honesto con botón de reintento manual.
const NETWORK_RETRY_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Un fallo de `fetch` que se rechaza (no una respuesta HTTP con error) es un
 * problema de conexión del cliente: DNS, offline, CORS, timeout, servidor caído.
 * `TypeError: Failed to fetch` (Chrome), `NetworkError` (Firefox), `Load failed`
 * (Safari) y los aborts por timeout entran aquí. Un error de compilación real
 * NUNCA llega por esta vía: el servidor respondió, así que se maneja por
 * `response.ok` / `data.error`.
 */
function isNetworkError(err: any): boolean {
  const name = err?.name || '';
  const msg = (err?.message || String(err)).toLowerCase();
  if (name === 'AbortError') return true;
  if (name === 'TypeError' && /fetch|network/.test(msg)) return true;
  return /failed to fetch|networkerror|network error|load failed|timeout|connection/.test(msg);
}

/**
 * oidMap (CAMBIO 2): slug → path completo del archivo del proyecto. El data-oid
 * del DOM codifica el slug; este mapa lo resuelve al archivo real. Lo entrega el
 * compilador y lo consumirá PR-2 (picker / fast lane / targeting). Vacío cuando
 * el compile no instrumentó nada o falló.
 */
export type OidMap = Record<string, string>;

export interface CompileResult {
  html: string;
  oidMap: OidMap;
}

/**
 * Núcleo del compile: POSTea los archivos a /api/compile y devuelve { html,
 * oidMap }. `compile()` (abajo) es un wrapper que expone sólo el html para los
 * callers históricos; `compileWithMeta()` expone el resultado completo.
 */
async function compileRequest(files: Map<string, string>): Promise<CompileResult> {
  if (files.size === 0) {
    return { html: generateLoadingHTML(), oidMap: {} };
  }

  const body = JSON.stringify({ files: Object.fromEntries(files) });
  let lastNetworkError: any = null;

  for (let attempt = 1; attempt <= NETWORK_RETRY_ATTEMPTS; attempt++) {
    try {
      const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization,
        },
        body,
      });

      if (response.status === 401) {
        return { html: generateErrorHTML('Session expired. Please refresh the page to continue building.'), oidMap: {} };
      }

      // El servidor respondió: cualquier error a partir de aquí es de compilación
      // real (o de sesión), NO de red → se mantiene el flujo actual (mensaje +
      // auto-fix del Verifier). No se reintenta la red.
      if (!response.ok) {
        let msg = 'Compilation failed';
        try {
          const data = await response.json();
          msg = data.error || msg;
        } catch { /* ignore */ }
        return { html: generateErrorHTML(msg), oidMap: {} };
      }

      const data = await response.json();
      if (data.error) return { html: generateErrorHTML(data.error), oidMap: {} };
      const html = data.html as string;
      if (html && html.includes('Invalid or expired session')) {
        return { html: generateErrorHTML('Session expired. Please refresh the page to continue building.'), oidMap: {} };
      }
      const oidMap: OidMap = (data.oidMap && typeof data.oidMap === 'object') ? data.oidMap : {};
      return { html, oidMap };
    } catch (err: any) {
      if (!isNetworkError(err)) {
        // Error inesperado del cliente (no de red): no reintentamos y no
        // prometemos un auto-fix que no va a ocurrir.
        return { html: generateNetworkErrorHTML(), oidMap: {} };
      }
      lastNetworkError = err;
      if (attempt < NETWORK_RETRY_ATTEMPTS) {
        // Backoff exponencial: 1ª espera 1s, 2ª espera 2s.
        await sleep(1000 * Math.pow(2, attempt - 1));
      }
    }
  }

  // Agotados los reintentos automáticos de red: estado honesto + reintento manual.
  console.error('[BrowserCompiler] Network error reaching /api/compile:', lastNetworkError);
  return { html: generateNetworkErrorHTML(), oidMap: {} };
}

/**
 * Compile all project files into a self-contained HTML string for srcdoc.
 * Signature unchanged (returns the html string) so existing callers work as-is.
 */
export async function compile(files: Map<string, string>): Promise<string> {
  const { html } = await compileRequest(files);
  return html;
}

/**
 * Like compile(), but also returns the oidMap (CAMBIO 2). Used by StudioEngine's
 * main compile so it can stash slug → path for PR-2's consumers.
 */
export async function compileWithMeta(files: Map<string, string>): Promise<CompileResult> {
  return compileRequest(files);
}

// ---------------------------------------------------------------------------
// Error HTML fallback (used when fetch itself fails)
// ---------------------------------------------------------------------------

// Marcador presente en TODA página de error del preview (compilación o red).
// Permite a los callers distinguir un preview válido de una página de error sin
// depender de un texto concreto ("Compilation Error"), que la página de red no
// contiene.
const PREVIEW_ERROR_MARKER = 'wyrd-preview-error';

/** true si el HTML es una página de error del preview (no un preview válido). */
export function isPreviewError(html: string): boolean {
  return html.includes(PREVIEW_ERROR_MARKER) || html.includes('Compilation Error');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateErrorHTML(message: string, stack?: string): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    `  <!-- ${PREVIEW_ERROR_MARKER} -->`,
    '  <style>',
    '    body{background:#0a0a0f;color:#fff;font-family:system-ui;padding:40px;margin:0;}',
    '    h1{color:#ef4444;font-size:1.5rem;margin-bottom:16px;}',
    '    pre{background:#111;border:1px solid #333;padding:16px;border-radius:8px;overflow:auto;font-size:12px;color:#f87171;white-space:pre-wrap;}',
    '    .note{margin-top:24px;color:#9ca3af;font-size:14px;}',
    '  </style>',
    '</head>',
    '<body>',
    '  <h1>Compilation Error</h1>',
    `  <pre>${escapeHtml(message)}${stack ? '\n\n' + escapeHtml(stack) : ''}</pre>`,
    '  <p class="note">The AI will auto-fix this...</p>',
    '</body>',
    '</html>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Network error page (client-side connectivity failure) — honest copy, no
// false "AI will fix it" promise. The manual retry button asks the parent
// (StudioEngine) to recompile via a flat postMessage matching the preview's
// message convention (type + top-level fields).
// ---------------------------------------------------------------------------
export function generateNetworkErrorHTML(): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="es">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <!-- ${PREVIEW_ERROR_MARKER} -->`,
    '  <style>',
    '    body{background:#0a0a0f;color:#e5e7eb;font-family:system-ui,-apple-system,sans-serif;margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;}',
    '    h1{color:#f59e0b;font-size:1.15rem;margin:0;font-weight:600;}',
    '    p{color:#9ca3af;font-size:14px;margin:0;max-width:420px;line-height:1.5;}',
    '    button{margin-top:12px;background:#E54D5B;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;}',
    '    button:hover{background:#d13d4b;}',
    '  </style>',
    '</head>',
    '<body>',
    '  <h1>Sin conexión con el servidor de compilación</h1>',
    '  <p>No se pudo conectar con el servidor de compilación. Revisa tu conexión — reintentando…</p>',
    '  <button type="button" onclick="window.parent.postMessage({ type: \'preview-retry-compile\' }, \'*\')">Reintentar</button>',
    '</body>',
    '</html>',
  ].join('\n');
}
