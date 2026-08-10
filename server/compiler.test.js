import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateHTML,
  PREVIEW_ERROR_CAPTURE_SCRIPT,
  PREVIEW_CLIENT_SCRIPT,
  instrumentSource,
  fileSlugFor,
  compileFiles,
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

// ---------------------------------------------------------------------------
// CAMBIO 1 — compile-time data-oid instrumentation (instrumentSource)
// ---------------------------------------------------------------------------

test('fileSlugFor strips the extension and keeps the project path', () => {
  assert.equal(fileSlugFor('src/components/HeroSection.tsx'), 'src/components/HeroSection');
  assert.equal(fileSlugFor('src/App.jsx'), 'src/App');
  assert.equal(fileSlugFor('src/main.tsx'), 'src/main');
});

test('native elements get a deterministic data-oid; ordinals follow document order', () => {
  const src = `export function App() {
  return (
    <div>
      <h1>Title</h1>
      <img src="a.png" />
    </div>
  );
}`;
  const { code, count } = instrumentSource(src, 'src/App');
  assert.equal(count, 3, 'div, h1, img instrumented');
  assert.match(code, /<div data-oid="src\/App:0">/);
  assert.match(code, /<h1 data-oid="src\/App:1">/);
  assert.match(code, /<img data-oid="src\/App:2" src="a\.png" \/>/);
});

test('component tags (Uppercase) are NOT instrumented — the oid belongs to the DOM host', () => {
  const src = `export function App() {
  return (
    <Layout>
      <section>
        <Card title="x" />
      </section>
    </Layout>
  );
}`;
  const { code, count } = instrumentSource(src, 'x/App');
  assert.equal(count, 1, 'only <section> is native');
  assert.ok(!/<Layout data-oid/.test(code), 'Layout not instrumented');
  assert.ok(!/<Card data-oid/.test(code), 'Card not instrumented');
  assert.match(code, /<section data-oid="x\/App:0">/);
});

test('instrumentation is deterministic — same source yields identical oids', () => {
  const src = `export const A = () => <div><span>a</span><span>b</span></div>;`;
  const a = instrumentSource(src, 'c/A').code;
  const b = instrumentSource(src, 'c/A').code;
  assert.equal(a, b);
});

test('spread props, self-closing, template-literal props and multiline tags survive', () => {
  const src = `export function App({ rest }) {
  const cls = 'p-4';
  return (
    <div
      {...rest}
      className={\`grid \${cls}\`}
      role="main"
    >
      <button
        type="button"
        onClick={() => count > 0 && go()}
      >
        Go
      </button>
      <br />
    </div>
  );
}`;
  const { code, count } = instrumentSource(src, 's/App');
  assert.equal(count, 3, 'div, button, br');
  // Attribute lands right after the tag name, before the spread — no JSX broken.
  assert.match(code, /<div data-oid="s\/App:0"\n\s+\{\.\.\.rest\}/);
  assert.match(code, /<button data-oid="s\/App:1"\n\s+type="button"/);
  assert.match(code, /<br data-oid="s\/App:2" \/>/);
  // The template literal and the `>` inside the arrow body are untouched.
  assert.match(code, /className=\{`grid \$\{cls\}`\}/);
  assert.match(code, /onClick=\{\(\) => count > 0 && go\(\)\}/);
});

test('a legacy residual data-oid is REPLACED, not duplicated — compiler is the authority', () => {
  const src = `export const A = () => <div data-oid="legacy:99" className="x">hi</div>;`;
  const { code, count } = instrumentSource(src, 'r/A');
  assert.equal(count, 1);
  assert.ok(!code.includes('legacy:99'), 'legacy oid removed');
  assert.match(code, /data-oid="r\/A:0"/);
  // Exactly one data-oid on the element.
  assert.equal((code.match(/data-oid=/g) || []).length, 1);
  assert.match(code, /className="x"/, 'other attributes preserved');
});

test('instrumentSource THROWS on unparseable input (caller falls back to uninstrumented)', () => {
  assert.throws(() => instrumentSource('export function App() { return <div', 'b/App'));
});

test('files with no native elements yield count 0 and unchanged source', () => {
  const src = `export const n = 1 + 2;\nexport const f = (a, b) => a < b;`;
  const { code, count } = instrumentSource(src, 'n/x');
  assert.equal(count, 0);
  assert.equal(code, src);
});

// ---------------------------------------------------------------------------
// CAMBIO 2 — compileFiles returns { html, oidMap }; the bundle DOM carries oids
// ---------------------------------------------------------------------------

test('compileFiles returns a populated oidMap and injects data-oid into the bundle', async () => {
  const files = {
    'src/main.tsx': `import { createRoot } from 'react-dom/client';
function App() {
  return <div className="wrap"><h1>Hello</h1></div>;
}
createRoot(document.getElementById('root')).render(<App />);
`,
  };
  const result = await compileFiles(files);
  assert.ok(!result.error, 'compiles without error: ' + (result.error || ''));
  assert.ok(result.oidMap, 'oidMap present');
  assert.equal(result.oidMap['src/main'], 'src/main.tsx', 'slug resolves to full path');
  // The bundled DOM (inside the IIFE) must carry the compile-time oids.
  assert.ok(result.html.includes('src/main:0'), 'first native oid in bundle');
  assert.ok(result.html.includes('src/main:1'), 'second native oid in bundle');
});

// ---------------------------------------------------------------------------
// CAMBIO 2 — instrumentación de latencia de esbuild / CDN
// ---------------------------------------------------------------------------

test('a build with no CDN deps emits the CDN summary with N=0', async () => {
  // Un proyecto que sólo usa React (alias local) no hace ningún fetch a esm.sh.
  // El resumen debe confirmarlo con "CDN fetches: 0" — la señal de que ninguna
  // latencia de red explica un esbuild lento (el veredicto pasa a CPU/infra).
  const files = {
    'src/main.tsx': `import { createRoot } from 'react-dom/client';
function App() {
  return <div className="wrap"><h1>Hola</h1></div>;
}
createRoot(document.getElementById('root')).render(<App />);
`,
  };

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };
  try {
    const result = await compileFiles(files);
    assert.ok(!result.error, 'compiles without error: ' + (result.error || ''));
  } finally {
    console.log = originalLog;
  }

  const summary = logs.find((l) => l.startsWith('[compile] CDN fetches:'));
  assert.ok(summary, 'CDN summary line emitted');
  assert.match(summary, /CDN fetches: 0, total 0ms/, 'no CDN fetches for an alias-only build');
  // Sin fetches no debe haber ninguna línea de fetch individual.
  assert.ok(!logs.some((l) => l.startsWith('[compile] CDN fetch:')), 'no per-fetch lines when N=0');
});
