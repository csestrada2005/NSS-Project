import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchUnsplash } from './unsplash.js';

/** Build a fake Unsplash photo result. */
function photo(id, { url, alt, name, link } = {}) {
  return {
    id,
    urls: { regular: url ?? `https://images.unsplash.com/photo-${id}?w=1080` },
    alt_description: alt ?? `alt for ${id}`,
    description: null,
    user: { name: name ?? `Author ${id}`, links: { html: link ?? `https://unsplash.com/@${id}` } },
  };
}

/** A fake fetch that maps each `query` param to a canned list of photos. */
function fakeFetch(byQuery) {
  return async (urlStr) => {
    const query = new URL(urlStr).searchParams.get('query');
    const results = byQuery[query] ?? [];
    return { ok: true, json: async () => ({ results }) };
  };
}

test('valid keywords → deduped by photo id, capped at 12', async () => {
  // Two keywords share photo "dup"; together they yield 3 unique photos.
  const fetchImpl = fakeFetch({
    'artisan bread': [photo('a'), photo('dup')],
    'bakery interior': [photo('dup'), photo('b')],
  });

  const { images } = await searchUnsplash({
    keywords: ['artisan bread', 'bakery interior'],
    accessKey: 'test-key',
    fetchImpl,
  });

  assert.equal(images.length, 3, 'dup photo appears once');
  const urls = images.map((i) => i.url);
  assert.equal(new Set(urls).size, urls.length, 'no duplicate urls');
  for (const img of images) {
    assert.ok(img.url && img.description && img.author_name, 'fields populated');
    assert.ok('author_link' in img);
  }
});

test('never returns more than 12 items even with abundant results', async () => {
  // 4 keywords × 5 unique photos each = 20 unique; cap must clamp to 12.
  const mk = (prefix) => Array.from({ length: 5 }, (_, i) => photo(`${prefix}${i}`));
  const fetchImpl = fakeFetch({
    k1: mk('k1_'),
    k2: mk('k2_'),
    k3: mk('k3_'),
    k4: mk('k4_'),
  });

  const { images } = await searchUnsplash({
    keywords: ['k1', 'k2', 'k3', 'k4'],
    accessKey: 'test-key',
    fetchImpl,
    perPage: 5,
  });

  assert.equal(images.length, 12);
  assert.equal(new Set(images.map((i) => i.url)).size, 12, 'all unique after dedupe');
});

test('description falls back to keyword when alt/description are absent', async () => {
  const fetchImpl = fakeFetch({
    'pastry closeup': [
      { id: 'x', urls: { regular: 'https://images.unsplash.com/x' }, alt_description: null, description: null, user: { name: 'Jo', links: { html: 'https://unsplash.com/@jo' } } },
    ],
  });

  const { images } = await searchUnsplash({
    keywords: ['pastry closeup'],
    accessKey: 'test-key',
    fetchImpl,
  });

  assert.equal(images[0].description, 'pastry closeup');
});

test('API down (fetch throws) → { images: [] }', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };

  const result = await searchUnsplash({
    keywords: ['artisan bread'],
    accessKey: 'test-key',
    fetchImpl,
  });

  assert.deepEqual(result, { images: [] });
});

test('non-2xx responses are skipped → { images: [] }', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });

  const result = await searchUnsplash({
    keywords: ['artisan bread'],
    accessKey: 'test-key',
    fetchImpl,
  });

  assert.deepEqual(result, { images: [] });
});

test('missing access key → { images: [] } without any fetch', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return { ok: true, json: async () => ({ results: [] }) };
  };

  const result = await searchUnsplash({ keywords: ['bread'], accessKey: '', fetchImpl });
  assert.deepEqual(result, { images: [] });
  assert.equal(called, false, 'no request made without a key');
});

test('empty / invalid keywords → { images: [] }', async () => {
  const fetchImpl = fakeFetch({});
  assert.deepEqual(await searchUnsplash({ keywords: [], accessKey: 'k', fetchImpl }), { images: [] });
  assert.deepEqual(await searchUnsplash({ keywords: ['   ', ''], accessKey: 'k', fetchImpl }), { images: [] });
  assert.deepEqual(await searchUnsplash({ keywords: undefined, accessKey: 'k', fetchImpl }), { images: [] });
});

test('one bad keyword does not sink the others', async () => {
  const fetchImpl = async (urlStr) => {
    const query = new URL(urlStr).searchParams.get('query');
    if (query === 'broken') throw new Error('boom');
    return { ok: true, json: async () => ({ results: [photo('good')] }) };
  };

  const { images } = await searchUnsplash({
    keywords: ['broken', 'works'],
    accessKey: 'test-key',
    fetchImpl,
  });

  assert.equal(images.length, 1);
  assert.equal(images[0].author_name, 'Author good');
});
