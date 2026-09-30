import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickProjectUrl } from './vercelDeployUrl.js';

const OWN = 'nebu-332f31d3-6a64-42c4-a587-4bd329f24f32-6ro6goukl-nebu-studio.vercel.app';

test('entrega el alias de proyecto más corto, nunca la dirección de la versión', () => {
  const url = pickProjectUrl({
    url: OWN,
    alias: [OWN, 'nebu-332f31d3-6a64-42c4-a587-4bd329f24f32-nebu-studio.vercel.app', 'nebu-332f31d3-6a64-42c4-a587-4bd329f24f32.vercel.app'],
  });
  assert.equal(url, 'https://nebu-332f31d3-6a64-42c4-a587-4bd329f24f32.vercel.app');
});

test('sin alias todavía → null (el servidor cae a la dirección de la versión)', () => {
  assert.equal(pickProjectUrl({ url: OWN, alias: [] }), null);
  assert.equal(pickProjectUrl({ url: OWN }), null);
  assert.equal(pickProjectUrl({ url: OWN, alias: [OWN] }), null);
  assert.equal(pickProjectUrl(null), null);
});
