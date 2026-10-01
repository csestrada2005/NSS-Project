import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureAuthSiteUrl, mergeAllowList } from './authSiteUrl.js';

const SITE = 'https://nebu-087ddaf3-6236-47ae-ba72-bc9688.vercel.app';

test('añade el dominio publicado sin quitar los que ya estaban, y sin duplicar', () => {
  assert.equal(mergeAllowList('', SITE), `${SITE},${SITE}/**`);
  assert.equal(mergeAllowList('http://localhost:3000', SITE), `http://localhost:3000,${SITE},${SITE}/**`);
  assert.equal(mergeAllowList(`${SITE},${SITE}/**`, SITE), `${SITE},${SITE}/**`);
});

test('configureAuthSiteUrl lee la config, fija site_url y la lista, y lanza si la API falla', async () => {
  const calls = [];
  const fake = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body });
    if (!init.method) return { ok: true, json: async () => ({ uri_allow_list: 'http://localhost:3000' }) };
    return { ok: true };
  };
  const body = await configureAuthSiteUrl('ref123', 'tok', `${SITE}/`, fake);
  assert.equal(body.site_url, SITE);
  assert.equal(calls[1].method, 'PATCH');
  assert.match(calls[1].url, /projects\/ref123\/config\/auth$/);
  assert.equal(JSON.parse(calls[1].body).uri_allow_list, `http://localhost:3000,${SITE},${SITE}/**`);

  await assert.rejects(configureAuthSiteUrl('r', 't', SITE, async () => ({ ok: false, status: 403 })), /GET config\/auth 403/);
  await assert.rejects(configureAuthSiteUrl('r', 't', 'http://inseguro.com', fake), /site url inválida/);
});
