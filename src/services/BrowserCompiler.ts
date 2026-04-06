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

export async function compile(files: Map<string, string>): Promise<string> {
  if (files.size === 0) {
    return generateLoadingHTML();
  }

  try {
    const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization,
      },
      body: JSON.stringify({ files: Object.fromEntries(files) }),
    });

    if (response.status === 401) {
      return generateErrorHTML('Session expired. Please refresh the page to continue building.');
    }

    if (!response.ok) {
      let msg = 'Compilation failed';
      try {
        const data = await response.json();
        msg = data.error || msg;
      } catch { /* ignore */ }
      return generateErrorHTML(msg);
    }

    const data = await response.json();
    if (data.error) return generateErrorHTML(data.error);
    const html = data.html as string;
    if (html && html.includes('Invalid or expired session')) {
      return generateErrorHTML('Session expired. Please refresh the page to continue building.');
    }
    return html;
  } catch (err: any) {
    // Network error — show client-side error page
    return generateErrorHTML(err?.message || String(err));
  }
}

// ---------------------------------------------------------------------------
// Error HTML fallback (used when fetch itself fails)
// ---------------------------------------------------------------------------

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
