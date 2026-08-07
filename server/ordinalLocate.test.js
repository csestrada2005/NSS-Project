import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateCodeByOrdinal, updateJSXPropByOrdinal } from '../src/utils/jsxOrdinal.js';
import { instrumentSource } from './compiler.js';

// ---------------------------------------------------------------------------
// PR-2 — deterministic ordinal-based localization (updateCode reconnection).
//
// The persisted source carries NO data-oid; edits localize the N-th native
// element, where N is exactly the ordinal the compiler stamps into the DOM. The
// cross-checks below tie updateCodeByOrdinal to instrumentSource so the two can
// never silently drift.
// ---------------------------------------------------------------------------

const MULTI = `export function App() {
  return (
    <div className="wrap">
      <h1 className="title">Hi</h1>
      <p className="body">Text</p>
    </div>
  );
}`;

test('locates the N-th native element (merge) and leaves the others untouched', () => {
  // Natives in document order: div(0), h1(1), p(2).
  const out = updateCodeByOrdinal(MULTI, { tagName: 'p', ordinal: 2 }, { className: 'body big' }, { classNameMode: 'merge' });
  assert.match(out, /<p className="body big">/, 'p merged to "body big"');
  assert.match(out, /<h1 className="title">/, 'h1 untouched');
  assert.match(out, /<div className="wrap">/, 'div untouched');
});

test('replace mode sets the className verbatim on the located element', () => {
  const out = updateCodeByOrdinal(MULTI, { tagName: 'h1', ordinal: 1 }, { className: 'text-red-500' }, { classNameMode: 'replace' });
  assert.match(out, /<h1 className="text-red-500">/, 'h1 replaced');
  assert.match(out, /<p className="body">/, 'p untouched');
});

test('text updates replace the located element text', () => {
  const out = updateCodeByOrdinal(MULTI, { tagName: 'h1', ordinal: 1 }, { textContent: 'Hello' });
  assert.match(out, /<h1 className="title">Hello<\/h1>/, 'h1 text replaced');
});

// ---------------------------------------------------------------------------
// .map() case — the mapped element appears ONCE in source (its ordinal is its
// source position); editing it mutates that single source element, so every DOM
// instance changes. This is the correct, expected behavior for repeated elements.
// ---------------------------------------------------------------------------
const MAPPED = `export function Nav() {
  const items = ['Home', 'About', 'Contact'];
  return (
    <nav className="bar">
      <ul>
        {items.map((it) => (
          <li key={it}>
            <a href="#" className="link">{it}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}`;

test('.map(): the mapped source element is localized by ordinal and mutated once', () => {
  // Natives in source order: nav(0), ul(1), li(2), a(3).
  const out = updateCodeByOrdinal(MAPPED, { tagName: 'a', ordinal: 3 }, { className: 'link active' }, { classNameMode: 'merge' });
  assert.match(out, /<a href="#" className="link active">/, 'the single source <a> gained "active"');
  // Only one <a> in source → only one edit.
  assert.equal((out.match(/className="link active"/g) || []).length, 1);
});

test('.map(): ordinal matches the compiler-stamped oid (no drift)', () => {
  const { code } = instrumentSource(MAPPED, 'x/Nav');
  // The compiler assigns the mapped <a> the ordinal 3.
  assert.match(code, /<a data-oid="x\/Nav:3"/, 'compiler stamps a:3');
  // updateCodeByOrdinal with that same ordinal must hit the <a>, not the <li>.
  const out = updateCodeByOrdinal(MAPPED, { tagName: 'a', ordinal: 3 }, { className: 'link x' }, { classNameMode: 'replace' });
  assert.match(out, /<a href="#" className="link x">/);
});

// ---------------------------------------------------------------------------
// Safety — never a speculative mutation.
// ---------------------------------------------------------------------------
test('tag-name mismatch at the ordinal refuses to mutate and calls onNotFound', () => {
  let msg = null;
  const out = updateCodeByOrdinal(MAPPED, { tagName: 'span', ordinal: 3 }, { className: 'x' }, { classNameMode: 'merge' }, (m) => { msg = m; });
  assert.equal(out, MAPPED, 'source unchanged on mismatch');
  assert.ok(msg, 'onNotFound was called');
});

test('out-of-range ordinal refuses to mutate and calls onNotFound', () => {
  let called = false;
  const out = updateCodeByOrdinal(MULTI, { tagName: 'div', ordinal: 99 }, { className: 'x' }, { classNameMode: 'merge' }, () => { called = true; });
  assert.equal(out, MULTI, 'source unchanged');
  assert.ok(called, 'onNotFound was called');
});

test('cross-check: parse the oid the compiler stamped, then localize by it', () => {
  const { code } = instrumentSource(MULTI, 'src/App');
  // The <p> is native #2.
  assert.match(code, /<p data-oid="src\/App:2"/);
  const ordinal = parseInt('src/App:2'.slice('src/App:2'.lastIndexOf(':') + 1), 10);
  const out = updateCodeByOrdinal(MULTI, { tagName: 'p', ordinal }, { className: 'body done' }, { classNameMode: 'replace' });
  assert.match(out, /<p className="body done">/);
});

// ---------------------------------------------------------------------------
// updateJSXPropByOrdinal
// ---------------------------------------------------------------------------
test('updateJSXPropByOrdinal sets a prop on the located native element', () => {
  const src = `export const A = () => <img src="a.png" />;`;
  const out = updateJSXPropByOrdinal(src, { tagName: 'img', ordinal: 0 }, 'alt', 'hello');
  assert.match(out, /alt="hello"/);
});
