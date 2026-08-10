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

// Nº de intentos y backoff exponencial. Cubre TANTO los errores de RED del
// cliente (fetch rechazado: DNS, offline, CORS) como los errores de SERVIDOR
// (5xx / respuesta vacía / timeout). Ninguno lo arregla el AI, así que en vez
// de mentir con "The AI will auto-fix this" reintentamos con backoff y, si sigue
// cayendo, devolvemos un veredicto honesto (server-error / network-error) que el
// caller usa para decidir si conserva o revierte la edición.
const RETRY_ATTEMPTS = 3;

// Techo del lado cliente para un compile. El servidor fija req.setTimeout(30s);
// abortamos un poco después para no quedarnos colgados si el gateway traga la
// respuesta. Un abort por este timeout se clasifica como ERROR DE SERVIDOR
// (servidor ocupado/lento), no como fallo de red del cliente (CAMBIO 2b).
const COMPILE_TIMEOUT_MS = 30000;

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

/**
 * Taxonomía honesta del resultado de un compile (CAMBIO 2). El caller decide
 * qué hacer con la edición según el veredicto:
 *  - 'ok'            → compiló; usar `html`.
 *  - 'compile-error' → HTTP 200/4xx con error de compilación en el body: el
 *                      cambio rompió la compilación → revertir. `html` es la
 *                      página de error de compilación.
 *  - 'server-error'  → 5xx / respuesta vacía / timeout: error del SERVIDOR, no
 *                      del cambio. NO revertir: la edición es presumiblemente
 *                      válida. `html` es una página "servidor ocupado" (los
 *                      flujos del panel visual la ignoran y conservan el último
 *                      preview bueno).
 *  - 'network-error' → fetch rechazado (failed to fetch): red del cliente.
 *                      `html` es la página de error de red con reintento manual.
 */
export type CompileVerdict = 'ok' | 'compile-error' | 'server-error' | 'network-error';

export interface CompileResult {
  html: string;
  oidMap: OidMap;
  verdict: CompileVerdict;
  /** Texto del error de compilación cuando verdict === 'compile-error'. */
  error?: string;
}

/**
 * classifyCompileResult — ÚNICA fuente de verdad que traduce un CompileResult a
 * la decisión semántica que TODO consumidor de un compile necesita. El compile
 * normal (saveVisualChanges) y el restore consumen EXACTAMENTE este clasificador;
 * ninguno reimplementa la taxonomía, así que no pueden divergir.
 *
 * Tres estados:
 *  - 'ok'         → el código compiló; renderizar `html`.
 *  - 'code-error' → el CÓDIGO es el culpable. Es el ÚNICO estado que puede
 *                   declarar "no compila", y SIEMPRE trae un `error` real (nunca
 *                   undefined). Se alcanza SOLO con un veredicto 'compile-error'
 *                   que además trae un mensaje de error no vacío — es decir, el
 *                   200-con-error (o 4xx) del compilador.
 *  - 'infra'      → NO es culpa del código: 'server-error' / 'network-error'
 *                   (timeout / 5xx / respuesta vacía / red del cliente) Y también
 *                   un 'compile-error' SIN mensaje real (401 / sesión expirada,
 *                   que el compilador marca como compile-error pero no es un fallo
 *                   del código restaurado). Conservar lo escrito; reintentar con
 *                   backoff; JAMÁS declarar "no compila".
 *
 * La clave honesta: un veredicto 'compile-error' sin `error` (sesión/401) NO es
 * un fallo de compilación del código — cae en 'infra', no en 'code-error'. Así,
 * 'code-error' nunca interpola un mensaje undefined.
 */
export type CompileDecision =
  | { status: 'ok' }
  | { status: 'code-error'; error: string }
  | { status: 'infra'; verdict: CompileVerdict };

export function classifyCompileResult(result: CompileResult): CompileDecision {
  if (result.verdict === 'ok') {
    return { status: 'ok' };
  }
  if (
    result.verdict === 'compile-error' &&
    typeof result.error === 'string' &&
    result.error.trim() !== ''
  ) {
    return { status: 'code-error', error: result.error };
  }
  // 'server-error', 'network-error', y cualquier 'compile-error' sin mensaje
  // real (sesión/401) son infra: no es culpa del código.
  return { status: 'infra', verdict: result.verdict };
}

/** Shape of the JSON body returned by /api/compile. */
interface CompilePayload {
  error?: string;
  html?: string;
  oidMap?: OidMap;
}

export interface CompileOptions {
  /**
   * Se invoca antes de cada reintento por ERROR DE SERVIDOR (5xx / vacío /
   * timeout), con el nº de intento ya consumido. Permite al caller mostrar
   * "Servidor ocupado — reintentando…" sin acoplar el backoff a la UI.
   */
  onServerRetry?: (attempt: number) => void;
}

/** Backoff exponencial: 1ª espera 1s, 2ª espera 2s. */
const backoffMs = (attempt: number) => 1000 * Math.pow(2, attempt - 1);

/**
 * Núcleo del compile: POSTea los archivos a /api/compile y devuelve un
 * CompileResult con veredicto (CAMBIO 2). `compile()` (abajo) es un wrapper que
 * expone sólo el html para los callers históricos; `compileWithMeta()` expone el
 * resultado completo con veredicto.
 */
async function compileRequest(files: Map<string, string>, opts?: CompileOptions): Promise<CompileResult> {
  if (files.size === 0) {
    return { html: generateLoadingHTML(), oidMap: {}, verdict: 'ok' };
  }

  const body = JSON.stringify({ files: Object.fromEntries(files) });
  // Tipo de fallo del último intento, para decidir el veredicto al agotar los
  // reintentos: 'server' (5xx/vacío/timeout) o 'network' (fetch rechazado).
  let lastFailure: 'server' | 'network' = 'server';

  const retryServer = async (attempt: number): Promise<boolean> => {
    lastFailure = 'server';
    if (attempt < RETRY_ATTEMPTS) {
      opts?.onServerRetry?.(attempt);
      await sleep(backoffMs(attempt));
      return true; // seguir al siguiente intento
    }
    return false; // agotados
  };

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), COMPILE_TIMEOUT_MS);
    try {
      const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization,
        },
        body,
        signal: controller.signal,
      });

      if (response.status === 401) {
        return { html: generateErrorHTML('Session expired. Please refresh the page to continue building.'), oidMap: {}, verdict: 'compile-error' };
      }

      // CAMBIO 2b — 5xx = ERROR DE SERVIDOR (OOM/timeout/502 del gateway). El
      // cambio es presumiblemente válido: NO se revierte, se reintenta con backoff.
      if (response.status >= 500) {
        if (await retryServer(attempt)) continue;
        break;
      }

      // CAMBIO 2a — 4xx con error de compilación real en el body: el cambio rompió
      // la compilación → veredicto compile-error (el caller revierte). No se
      // reintenta: recompilar el mismo código dará el mismo error.
      if (!response.ok) {
        let msg = 'Compilation failed';
        try {
          const data = await response.json();
          msg = data.error || msg;
        } catch { /* ignore */ }
        return { html: generateErrorHTML(msg), oidMap: {}, verdict: 'compile-error', error: msg };
      }

      // 200: parsear el cuerpo. Un cuerpo vacío/ilegible es una respuesta
      // truncada del servidor → tratar como error de servidor y reintentar.
      let data: CompilePayload | null = null;
      try {
        data = (await response.json()) as CompilePayload;
      } catch {
        if (await retryServer(attempt)) continue;
        break;
      }

      // El compilador puede devolver 200 con { error } (ruta de error suave).
      if (data && data.error) {
        return { html: generateErrorHTML(data.error), oidMap: {}, verdict: 'compile-error', error: data.error };
      }
      const html = data?.html;
      if (!html) {
        // Respuesta 200 sin html → servidor devolvió algo vacío/inesperado.
        if (await retryServer(attempt)) continue;
        break;
      }
      if (html.includes('Invalid or expired session')) {
        return { html: generateErrorHTML('Session expired. Please refresh the page to continue building.'), oidMap: {}, verdict: 'compile-error' };
      }
      const oidMap: OidMap = (data?.oidMap && typeof data.oidMap === 'object') ? data.oidMap : {};
      return { html, oidMap, verdict: 'ok' };
    } catch (err) {
      // CAMBIO 2b/2c — un abort por NUESTRO timeout (controller propio) es un
      // servidor lento/ocupado; un fetch rechazado ("failed to fetch") es red del
      // cliente. Ambos se reintentan, pero con veredicto final distinto.
      if ((err as { name?: string })?.name === 'AbortError') {
        if (await retryServer(attempt)) continue;
        break;
      }
      if (isNetworkError(err)) {
        lastFailure = 'network';
        if (attempt < RETRY_ATTEMPTS) {
          await sleep(backoffMs(attempt));
          continue;
        }
        break;
      }
      // Error inesperado del cliente (no de red): no prometemos un auto-fix que no
      // va a ocurrir; lo tratamos como fallo de red (estado honesto + reintento).
      return { html: generateNetworkErrorHTML(), oidMap: {}, verdict: 'network-error' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Agotados los reintentos automáticos.
  if (lastFailure === 'server') {
    console.error('[BrowserCompiler] Server error reaching /api/compile (retries exhausted).');
    return { html: generateServerBusyHTML(), oidMap: {}, verdict: 'server-error' };
  }
  console.error('[BrowserCompiler] Network error reaching /api/compile (retries exhausted).');
  return { html: generateNetworkErrorHTML(), oidMap: {}, verdict: 'network-error' };
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
 * Like compile(), but also returns the oidMap and the honest verdict (CAMBIO 2).
 * Used by StudioEngine's governed compile so it can distinguish a real compile
 * error (revert) from a busy server (keep the edit) and from a network drop.
 */
export async function compileWithMeta(files: Map<string, string>, opts?: CompileOptions): Promise<CompileResult> {
  return compileRequest(files, opts);
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
// ---------------------------------------------------------------------------
// Server-busy page (CAMBIO 2b) — the compile server answered 5xx / empty /
// timed out after all retries. This is NOT the edit's fault, so callers on the
// visual panel IGNORE this html and keep the last good preview; it only shows
// for callers that render whatever compile() returns (restore, manual retry).
// Honest copy: no "AI will fix it", no revert prompt.
// ---------------------------------------------------------------------------
export function generateServerBusyHTML(): string {
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
    '    p{color:#9ca3af;font-size:14px;margin:0;max-width:440px;line-height:1.5;}',
    '    button{margin-top:12px;background:#E54D5B;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;}',
    '    button:hover{background:#d13d4b;}',
    '  </style>',
    '</head>',
    '<body>',
    '  <h1>Servidor de compilación ocupado</h1>',
    '  <p>El servidor está ocupado y no pudo verificar el cambio ahora mismo. Tu edición se conservó; el preview se actualizará al reconectar.</p>',
    '  <button type="button" onclick="window.parent.postMessage({ type: \'preview-retry-compile\' }, \'*\')">Reintentar</button>',
    '</body>',
    '</html>',
  ].join('\n');
}

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
