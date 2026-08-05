import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateHTML,
  PREVIEW_ERROR_CAPTURE_SCRIPT,
  PREVIEW_CLIENT_SCRIPT,
} from './compiler.js';

// ---------------------------------------------------------------------------
// CAMBIO 1 — captura de errores PRE-BUNDLE
// ---------------------------------------------------------------------------

test('generateHTML injects the error-capture script BEFORE the bundle and the tailwind vendor', () => {
  const bundle = 'console.log("bundle body");';
  const html = generateHTML(bundle, '');

  const captureIdx = html.indexOf('addEventListener');
  const tailwindIdx = html.indexOf('/vendor/tailwindcss-browser.js');
  const bundleIdx = html.indexOf('bundle body');

  assert.ok(captureIdx !== -1, 'capture script present');
  assert.ok(tailwindIdx !== -1, 'tailwind vendor present');
  assert.ok(bundleIdx !== -1, 'bundle present');

  // The capture listeners must be registered before ANYTHING else evaluates.
  assert.ok(captureIdx < tailwindIdx, 'capture script comes before tailwind vendor');
  assert.ok(captureIdx < bundleIdx, 'capture script comes before the bundle');
});

test('the error-capture script no longer lives inside the (post-bundle) client script', () => {
  // The listeners moved out of PREVIEW_CLIENT_SCRIPT so they can mount pre-bundle.
  assert.ok(
    !PREVIEW_CLIENT_SCRIPT.includes("addEventListener('error'"),
    'client script must not re-register the error listener'
  );
  assert.ok(
    PREVIEW_ERROR_CAPTURE_SCRIPT.includes("addEventListener('error'"),
    'capture script registers the error listener'
  );
});

// Evalúa el PREVIEW_ERROR_CAPTURE_SCRIPT en un window/document simulados y
// devuelve { fireError, messages, setRootChildren }.
function mountCaptureScript() {
  const handlers = { error: [], unhandledrejection: [] };
  const messages = [];
  let rootChildren = 0;

  const window = {
    addEventListener(type, cb) {
      (handlers[type] ||= []).push(cb);
    },
    parent: {
      postMessage(msg) {
        messages.push(msg);
      },
    },
  };
  const document = {
    getElementById(id) {
      if (id !== 'root') return null;
      return { get childElementCount() { return rootChildren; } };
    },
  };

  // El script es un IIFE; lo ejecutamos con window/document inyectados.
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', PREVIEW_ERROR_CAPTURE_SCRIPT)(window, document);

  return {
    messages,
    setRootChildren: (n) => { rootChildren = n; },
    fireError: (event) => handlers.error.forEach((cb) => cb(event)),
  };
}

test("a top-level `null.x` error before React mounts reports source 'module-evaluation'", () => {
  const ctx = mountCaptureScript();
  ctx.setRootChildren(0); // React has NOT mounted yet

  // Simula lo que el browser emite cuando la evaluación top-level del bundle
  // lanza `null.x` (TypeError) — el handler ya está montado por el script del head.
  ctx.fireError({
    message: "Cannot read properties of null (reading 'x')",
    filename: 'srcdoc',
    lineno: 38768,
    colno: 1,
    error: new TypeError("Cannot read properties of null (reading 'x')"),
  });

  assert.equal(ctx.messages.length, 1, 'exactly one postMessage');
  const m = ctx.messages[0];
  assert.equal(m.type, 'preview-runtime-error');
  assert.equal(m.source, 'module-evaluation');
  assert.match(m.message, /Cannot read properties of null/);
});

test("an error after React mounts reports source 'window-error'", () => {
  const ctx = mountCaptureScript();
  ctx.setRootChildren(3); // React rendered some children

  ctx.fireError({
    message: 'boom',
    filename: 'srcdoc',
    lineno: 10,
    colno: 1,
    error: new Error('boom'),
  });

  assert.equal(ctx.messages.length, 1);
  assert.equal(ctx.messages[0].source, 'window-error');
});

test('duplicate errors are deduplicated within a single load', () => {
  const ctx = mountCaptureScript();
  ctx.setRootChildren(0);
  const event = {
    message: 'same error',
    filename: 'srcdoc',
    lineno: 5,
    colno: 1,
    error: new Error('same error'),
  };
  ctx.fireError(event);
  ctx.fireError(event);
  assert.equal(ctx.messages.length, 1, 'second identical error is suppressed');
});
