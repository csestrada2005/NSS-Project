import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { assetStoragePath, faviconSizes, isSafeSvg, processFavicon, processUpload, MAX_IMAGE_BYTES } from './assets.js';

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

// Favicon (bloque 2): PNG maestro cuadrado de 512 px, encajado sin recortar.
test('favicon: imagen alargada se encaja sin recortar, con fondo transparente', async () => {
  const out = await processFavicon({ name: 'logo.jpg', type: 'image/jpeg', buffer: await jpeg(1000, 250) });
  assert.deepEqual([out.kind, out.mime, out.width, out.height], ['favicon', 'image/png', 512, 512]);
  const { data, info } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [512, 512, 4]);
  const alphaAt = (x, y) => data[(y * 512 + x) * 4 + 3];
  assert.equal(alphaAt(256, 5), 0, 'franja de arriba transparente (no se estiró ni recortó)');
  assert.equal(alphaAt(256, 256), 255, 'el centro es la imagen');
  assert.equal(alphaAt(5, 256), 255, 'a lo ancho llena el cuadro: no se recortó el logo');
});

test('favicon: SVG seguro se convierte a PNG; con scripts, PDF o enorme se rechaza', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
  const out = await processFavicon({ name: 'i.svg', type: 'image/svg+xml', buffer: svg });
  assert.equal((await sharp(out.buffer).metadata()).format, 'png');
  await assert.rejects(processFavicon({ name: 'x.svg', type: 'image/svg+xml', buffer: Buffer.from('<svg><script>x</script></svg>') }), /scripts/);
  await assert.rejects(processFavicon({ name: 'a.pdf', type: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }), /formato no permitido/);
  await assert.rejects(processFavicon({ name: 'big.png', type: 'image/png', buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1) }), /10 MB/);
});

test('favicon: del maestro salen los PNG de 32 y 180 px', async () => {
  const { buffer } = await processFavicon({ name: 'l.png', type: 'image/png', buffer: await jpeg(600, 600) });
  const { png32, png180 } = await faviconSizes(buffer);
  const [m32, m180] = await Promise.all([sharp(png32).metadata(), sharp(png180).metadata()]);
  assert.deepEqual([m32.format, m32.width, m32.height], ['png', 32, 32]);
  assert.deepEqual([m180.format, m180.width, m180.height], ['png', 180, 180]);
});
