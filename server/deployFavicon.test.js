import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withCustomFavicon, withCustomFaviconLinks, FAVICON_32_PATH, APPLE_TOUCH_ICON_PATH } from '../src/utils/deployFavicon.js';

// Bloque 2 (2026-10-06): el ícono propio entra SÓLO al paquete que va a Vercel.

const SEO_HTML = `<!doctype html>
<html>
  <head>
    <title>Vertigo</title>
    <meta name="description" content="x" data-brief-seo />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" data-brief-seo />
  </head>
  <body></body>
</html>`;

test('cambia el enlace automático por los PNG propios, una sola vez', () => {
  const out = withCustomFaviconLinks(SEO_HTML);
  assert.doesNotMatch(out, /favicon\.svg/);
  assert.match(out, /<link rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32\.png" \/>/);
  assert.match(out, /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png" \/>/);
  assert.match(out, /data-brief-seo \/>\n/, 'el resto del SEO queda');
  assert.equal(withCustomFaviconLinks(out), out, 'idempotente');
});

test('quita también shortcut icon y apple-touch-icon previos; sin </head> los antepone', () => {
  const html = `<head><link rel='shortcut icon' href='/x.ico'><link rel="apple-touch-icon" href="/old.png"></head>`;
  const out = withCustomFaviconLinks(html);
  assert.doesNotMatch(out, /x\.ico|old\.png/);
  assert.equal((out.match(/rel="icon"/g) ?? []).length, 1);
  assert.match(withCustomFaviconLinks('<div></div>'), /^ {4}<link rel="icon"/);
});

test('añade los dos PNG al paquete sin tocar lo demás', () => {
  const icon = { png32: Buffer.from([1]), png180: Buffer.from([2]) };
  const files = { 'index.html': SEO_HTML, 'src/App.tsx': 'app', 'public/favicon.svg': '<svg/>' };
  const out = withCustomFavicon(files, icon);
  assert.equal(out[FAVICON_32_PATH], icon.png32);
  assert.equal(out[APPLE_TOUCH_ICON_PATH], icon.png180);
  assert.equal(out['src/App.tsx'], 'app');
  assert.equal(files['index.html'], SEO_HTML, 'el original no se modifica');
});

test('sin index.html o sin ícono, devuelve el paquete igual', () => {
  const files = { 'src/App.tsx': 'app' };
  assert.equal(withCustomFavicon(files, { png32: Buffer.alloc(1), png180: Buffer.alloc(1) }), files);
  const withHtml = { 'index.html': SEO_HTML };
  assert.equal(withCustomFavicon(withHtml, null), withHtml);
});
