import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { assetStoragePath, isSafeSvg, processUpload, MAX_IMAGE_BYTES } from './assets.js';

const jpeg = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg({ quality: 92 }).toBuffer();

test('JPG grande → WebP de máximo 2560 px', async () => {
  const out = await processUpload({ name: 'Hero Foto.JPG', type: 'image/jpeg', buffer: await jpeg(4000, 3000) });
  assert.equal(out.mime, 'image/webp');
  assert.equal(out.ext, 'webp');
  assert.equal(out.width, 2560);
  assert.equal(out.height, 1920);
  assert.equal((await sharp(out.buffer).metadata()).format, 'webp');
});

test('PNG chico → WebP sin agrandar', async () => {
  const png = await sharp({ create: { width: 300, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
  const out = await processUpload({ name: 'logo.png', type: 'image/png', buffer: png });
  assert.deepEqual([out.mime, out.width, out.height], ['image/webp', 300, 200]);
});

test('SVG seguro se guarda tal cual; con scripts se rechaza', async () => {
  const ok = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>');
  assert.equal((await processUpload({ name: 'i.svg', type: 'image/svg+xml', buffer: ok })).buffer, ok);
  assert.equal(isSafeSvg('<svg onload="alert(1)"></svg>'), false);
  await assert.rejects(processUpload({ name: 'x.svg', type: 'image/svg+xml', buffer: Buffer.from('<svg><script>x</script></svg>') }), /scripts/);
});

test('PDF válido; formatos y tamaños fuera de regla se rechazan', async () => {
  const pdf = Buffer.from('%PDF-1.7\n...');
  assert.equal((await processUpload({ name: 'menu.pdf', type: 'application/pdf', buffer: pdf })).kind, 'document');
  await assert.rejects(processUpload({ name: 'fake.pdf', type: 'application/pdf', buffer: Buffer.from('hola') }), /no es un PDF/);
  await assert.rejects(processUpload({ name: 'a.gif', type: 'image/gif', buffer: Buffer.from('GIF89a') }), /formato no permitido/);
  await assert.rejects(processUpload({ name: 'big.jpg', type: 'image/jpeg', buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1) }), /10 MB/);
});

test('la ruta del archivo es segura y legible', () => {
  const p = assetStoragePath('087ddaf3', 'Foto del Equipo (Final)!.JPG', 'webp');
  assert.match(p, /^087ddaf3\/[0-9a-f]{8}-foto-del-equipo-final\.webp$/);
});
