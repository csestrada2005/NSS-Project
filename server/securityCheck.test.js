import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECURITY_REPORT_SQL, evaluateDatabase, evaluateCode, fetchSecurityReport, runSecurityCheck } from './securityCheck.js';

// Casos reales de la sesión del 2026-10-01 (Vertigo).
const report = {
  tables: [
    { name: 'recomendaciones', rls: true },
    { name: 'newsletter_subscribers', rls: true },
    { name: 'productos', rls: false },
    { name: 'resenas', rls: true },
  ],
  policies: [
    // El formulario publicado inserta status "approved" desde el navegador.
    { table: 'recomendaciones', name: 'public insert', cmd: 'INSERT', roles: ['public'], qual: null, check: 'true' },
    { table: 'recomendaciones', name: 'public read', cmd: 'SELECT', roles: ['anon'], qual: 'true', check: null },
    // Emails legibles por cualquiera.
    { table: 'newsletter_subscribers', name: 'allow_public_select', cmd: 'SELECT', roles: ['public'], qual: 'true', check: null },
    { table: 'resenas', name: 'anyone deletes', cmd: 'DELETE', roles: '{anon}', qual: '(true)', check: null },
    // Nebu (2026-10-04): "con sesión" incluye clientes → editar TODO con sólo
    // tener sesión es grave. Una política del dueño (auth.uid()) no lo es.
    { table: 'resenas', name: 'auth update', cmd: 'UPDATE', roles: ['authenticated'], qual: 'true', check: null },
    { table: 'resenas', name: 'own update', cmd: 'UPDATE', roles: ['authenticated'], qual: '(auth.uid() = user_id)', check: null },
    { table: 'newsletter_subscribers', name: 'authenticated_select_newsletter_subscribers', cmd: 'SELECT', roles: ['authenticated'], qual: 'true', check: null },
    // Pública pero con condición: no es "para cualquiera".
    { table: 'resenas', name: 'own rows', cmd: 'UPDATE', roles: ['public'], qual: '(auth.uid() = user_id)', check: null },
  ],
  columns: [
    { table: 'recomendaciones', column: 'nombre' }, { table: 'recomendaciones', column: 'texto' },
    { table: 'recomendaciones', column: 'status' },
    { table: 'newsletter_subscribers', column: 'email' }, { table: 'newsletter_subscribers', column: 'nombre' },
    { table: 'resenas', column: 'comment' }, { table: 'app_users', column: 'role' },
  ],
};

test('base: RLS apagado, escritura pública, emails públicos y el insert que se salta la moderación', () => {
  const f = evaluateDatabase(report);
  const kinds = f.map((x) => `${x.severity}:${x.kind}:${x.table}`).sort();
  assert.deepEqual(kinds, [
    'aviso:public_insert_privileged:recomendaciones',
    'grave:auth_pii_read:newsletter_subscribers',
    'grave:auth_write:resenas',
    'grave:public_pii_read:newsletter_subscribers',
    'grave:public_write:resenas',
    'grave:rls_off:productos',
  ].sort());
  assert.deepEqual(f.find((x) => x.kind === 'public_pii_read').columns, ['email']);
  assert.deepEqual(f.find((x) => x.kind === 'public_insert_privileged').columns, ['status']);
});

test('base: lectura pública de datos NO personales no es hallazgo', () => {
  const f = evaluateDatabase(report);
  assert.equal(f.some((x) => x.kind === 'public_pii_read' && x.table === 'recomendaciones'), false);
});

test('código: llave secreta en el navegador y función de servidor que no verifica quién llama', () => {
  const files = [
    { path: 'src/lib/admin.ts', content: "const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop';" },
    { path: 'supabase/functions/manage-users/index.ts', content: "const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));" },
    { path: 'supabase/functions/safe/index.ts', content: "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const { data } = await admin.auth.getUser(jwt);" },
  ];
  const kinds = evaluateCode(files).map((x) => `${x.severity}:${x.kind}:${x.path}`);
  assert.ok(kinds.includes('aviso:edge_no_caller_check:supabase/functions/manage-users/index.ts'));
  assert.ok(!kinds.some((k) => k.includes('functions/safe')));
});

test('runSecurityCheck: lo grave primero; sin base, sólo el código', () => {
  const all = runSecurityCheck({ report, files: [] });
  assert.equal(all[0].severity, 'grave');
  assert.equal(all.at(-1).severity, 'aviso');
  assert.deepEqual(runSecurityCheck({ report: null, files: [] }), []);
});

test('la consulta es sólo de lectura', () => {
  assert.match(SECURITY_REPORT_SQL, /^select /i);
  assert.doesNotMatch(SECURITY_REPORT_SQL, /\b(insert|update|delete|drop|alter|create|grant|truncate)\b/i);
});

test('fetchSecurityReport lee el "report" de la respuesta y lanza si la API falla', async () => {
  const ok = async () => ({ ok: true, text: async () => JSON.stringify([{ report: { tables: [] } }]) });
  assert.deepEqual(await fetchSecurityReport('ref', 'tok', ok), { tables: [] });
  const ko = async () => ({ ok: false, status: 403, text: async () => 'forbidden' });
  await assert.rejects(fetchSecurityReport('ref', 'tok', ko), /Management API 403/);
});

test('función de servidor con imports que Supabase rechaza → aviso', () => {
  const files = [
    { path: 'supabase/functions/assign-client-role/index.ts', content: "import { cache } from 'https://deno.land/x/httpcache@0.1.2/mod.ts';\nimport { createClient } from 'npm:@supabase/supabase-js@2';" },
    { path: 'supabase/functions/ok/index.ts', content: "import { createClient } from 'npm:@supabase/supabase-js@2';" },
  ];
  const kinds = evaluateCode(files).map((x) => `${x.kind}:${x.path}`);
  assert.deepEqual(kinds, ['edge_bad_import:supabase/functions/assign-client-role/index.ts']);
});
