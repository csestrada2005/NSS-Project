import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidSecretName, isValidSecretValue, requiredSecretsFromFiles, secretsStatus,
  listServerSecretNames, setServerSecret, deleteServerSecret,
} from './projectSecrets.js';

// Llaves "como Lovable" (2026-10-08): la lista sale del código, no de una lista fija.

const fn = (slug, content) => ({ path: `supabase/functions/${slug}/index.ts`, content });

test('cualquier proveedor: lo que pidan las funciones, sin las SUPABASE_*', () => {
  const required = requiredSecretsFromFiles([
    fn('ask-perplexity', `const k = Deno.env.get('PERPLEXITY_API_KEY');\nconst u = Deno.env.get("SUPABASE_URL");`),
    fn('tipo-cambio', 'const t = Deno.env.get(`BANXICO_TOKEN`) ?? ""; const p = Deno.env.get( "PERPLEXITY_API_KEY" );'),
    fn('pagos', "const s = Deno.env.get('STRIPE_SECRET_KEY')!; const r = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');"),
    { path: 'src/App.tsx', content: "Deno.env.get('NO_CUENTA')" },
    { path: 'supabase/migrations/1.sql', content: "Deno.env.get('TAMPOCO')" },
  ]);
  assert.deepEqual(Object.fromEntries(required), {
    PERPLEXITY_API_KEY: ['ask-perplexity', 'tipo-cambio'],
    BANXICO_TOKEN: ['tipo-cambio'],
    STRIPE_SECRET_KEY: ['pagos'],
  });
});

test('estado: falta / configurada / configurada sin usar; las SUPABASE_* del servidor no se muestran', () => {
  const required = new Map([['STRIPE_SECRET_KEY', ['pagos']], ['BANXICO_TOKEN', ['tipo-cambio']]]);
  assert.deepEqual(secretsStatus(required, ['STRIPE_SECRET_KEY', 'OLD_KEY', 'SUPABASE_DB_URL']), [
    { name: 'BANXICO_TOKEN', status: 'missing', usedBy: ['tipo-cambio'] },
    { name: 'STRIPE_SECRET_KEY', status: 'set', usedBy: ['pagos'] },
    { name: 'OLD_KEY', status: 'unused', usedBy: [] },
  ]);
});

test('nombres y valores válidos', () => {
  assert.equal(isValidSecretName('PERPLEXITY_API_KEY'), true);
  assert.equal(isValidSecretName('SUPABASE_URL'), false, 'reservada por Supabase');
  assert.equal(isValidSecretName('stripe key'), false);
  assert.equal(isValidSecretName('1KEY'), false);
  assert.equal(isValidSecretValue('  '), false);
  assert.equal(isValidSecretValue('x'.repeat(8193)), false);
  assert.equal(isValidSecretValue('abc'), true);
});

test('Management API: lista sólo nombres; guardar y borrar mandan lo justo', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, auth: init.headers.Authorization });
    if (init.method === 'GET') return new Response(JSON.stringify([{ name: 'STRIPE_SECRET_KEY', value: 'digest123' }]), { status: 200 });
    return new Response('', { status: 200 });
  };
  try {
    assert.deepEqual(await listServerSecretNames('ref1', 'tok'), ['STRIPE_SECRET_KEY']);
    await setServerSecret('ref1', 'tok', 'BANXICO_TOKEN', 'valor');
    await deleteServerSecret('ref1', 'tok', 'OLD_KEY');
  } finally {
    globalThis.fetch = original;
  }
  assert.ok(calls.every((c) => c.url === 'https://api.supabase.com/v1/projects/ref1/secrets' && c.auth === 'Bearer tok'));
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST', 'DELETE']);
  assert.equal(calls[1].body, JSON.stringify([{ name: 'BANXICO_TOKEN', value: 'valor' }]));
  assert.equal(calls[2].body, JSON.stringify(['OLD_KEY']));
});

test('un error de la API no repite el valor en el mensaje', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('bad request', { status: 400 });
  try {
    await assert.rejects(setServerSecret('ref1', 'tok', 'K', 'valor-secreto'), (err) => !String(err.message).includes('valor-secreto') && err.status === 400);
  } finally {
    globalThis.fetch = original;
  }
});
