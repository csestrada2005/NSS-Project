import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthCache, tokenExpiryMs } from './authCache.js';

const jwt = (exp) =>
  ['h', Buffer.from(JSON.stringify({ sub: 'u1', exp })).toString('base64url'), 's'].join('.');

test('recuerda una sesión verificada hasta 60 s', () => {
  let t = 1_000_000;
  const cache = createAuthCache({ now: () => t });
  const token = jwt(Math.floor(t / 1000) + 3600);
  assert.equal(cache.get(token), null);
  cache.set(token, { id: 'u1' });
  assert.deepEqual(cache.get(token), { id: 'u1' });
  t += 59_000;
  assert.deepEqual(cache.get(token), { id: 'u1' });
  t += 2_000;
  assert.equal(cache.get(token), null, 'pasados 60 s vuelve a preguntar a Supabase');
});

test('nunca más allá del vencimiento del token', () => {
  let t = 1_000_000;
  const cache = createAuthCache({ now: () => t });
  const token = jwt(Math.floor(t / 1000) + 10);
  cache.set(token, { id: 'u1' });
  t += 11_000;
  assert.equal(cache.get(token), null);
  const expired = jwt(Math.floor(t / 1000) - 1);
  cache.set(expired, { id: 'u1' });
  assert.equal(cache.get(expired), null, 'un token ya vencido no se guarda');
});

test('otro token no comparte la entrada, y hay tope de tamaño', () => {
  const cache = createAuthCache({ max: 2 });
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const [a, b, c] = ['a', 'b', 'c'].map((x) => jwt(exp) + x);
  cache.set(a, { id: 'A' });
  cache.set(b, { id: 'B' });
  cache.set(c, { id: 'C' });
  assert.equal(cache.size, 2);
  assert.equal(cache.get(a), null, 'el más viejo sale primero');
  assert.deepEqual(cache.get(c), { id: 'C' });
});

test('tokenExpiryMs tolera tokens ilegibles', () => {
  assert.equal(tokenExpiryMs('no-es-un-jwt'), null);
  assert.equal(tokenExpiryMs(jwt(100)), 100_000);
});
