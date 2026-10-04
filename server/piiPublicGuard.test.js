import { test } from 'node:test';
import assert from 'node:assert/strict';
import { piiTablesInSql, stripPiiPublicRead } from '../src/utils/piiPublicGuard.js';

// La migración real de suscriptores (Vertigo, 2026-10-01).
const NEWSLETTER = `CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  nombre     TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

comment on table public.newsletter_subscribers is 'wyrd:read=public';

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_public_insert"
  ON public.newsletter_subscribers
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "allow_public_select"
  ON public.newsletter_subscribers
  FOR SELECT
  TO public
  USING (true);
`;

test('quita la lectura pública de una tabla con emails y deja el resto intacto', () => {
  const { sql, tables } = stripPiiPublicRead(NEWSLETTER);
  assert.deepEqual(tables, ['newsletter_subscribers']);
  assert.doesNotMatch(sql, /wyrd:read=public/);
  assert.doesNotMatch(sql, /allow_public_select/);
  assert.match(sql, /allow_public_insert/, 'el formulario de suscripción sigue funcionando');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /email      TEXT NOT NULL UNIQUE/);
});

test('una tabla sin datos personales puede seguir siendo pública', () => {
  const expeditions = `create table public.expeditions (id uuid primary key, title text, price numeric);
comment on table public.expeditions is 'wyrd:read=public';`;
  const r = stripPiiPublicRead(expeditions);
  assert.equal(r.sql, expeditions);
  assert.deepEqual(r.tables, []);
});

test('detecta las columnas personales y no confunde restricciones con columnas', () => {
  const sql = `create table clientes (id uuid primary key, telefono text, direccion text, constraint u unique (telefono));`;
  assert.deepEqual(piiTablesInSql(sql).get('clientes'), ['telefono', 'direccion']);
});

// 2026-10-01 — check de Samuel: una migración que sólo RE-ABRÍA la tabla
// (creada en otra migración) pasaba la guardia, porque ésta sólo conocía las
// columnas de las tablas creadas en el mismo SQL.
const REOPEN = `-- Migration: make_newsletter_subscribers_public
drop view if exists public.newsletter_subscribers_public;

comment on table public.newsletter_subscribers is 'wyrd:read=public';

drop policy if exists "anon_select_newsletter_subscribers" on public.newsletter_subscribers;

create policy "anon_select_newsletter_subscribers"
  on public.newsletter_subscribers
  for select
  to anon
  using (true);

grant select on public.newsletter_subscribers to anon;
grant select on public.newsletter_subscribers to authenticated;
`;

test('re-abrir una tabla creada en OTRA migración también se frena, con aviso', async () => {
  const { piiTablesInProject } = await import('../src/utils/piiPublicGuard.js');
  const isMigration = (p) => p.startsWith('supabase/migrations/');
  const project = new Map([
    ['supabase/migrations/20261001092720_create_newsletter_subscribers.sql', NEWSLETTER],
    ['supabase/migrations/20261001100000_add_phone.sql', 'alter table public.clientes add column telefono text;'],
    ['src/App.tsx', 'create table nope (email text);'],
  ]);
  const known = piiTablesInProject(project, isMigration);
  assert.deepEqual(known.get('newsletter_subscribers'), ['email']);
  assert.deepEqual(known.get('clientes'), ['telefono']);
  assert.equal(known.has('nope'), false, 'sólo cuentan las migraciones');

  const { sql, details } = stripPiiPublicRead(REOPEN, known);
  assert.deepEqual(details, [{ table: 'newsletter_subscribers', columns: ['email'] }]);
  assert.doesNotMatch(sql, /wyrd:read=public/);
  assert.doesNotMatch(sql, /create policy "anon_select_newsletter_subscribers"/);
  assert.doesNotMatch(sql, /to anon;/);
  assert.match(sql, /grant select on public\.newsletter_subscribers to authenticated;/, 'el acceso con sesión se queda');
  assert.match(sql, /drop view if exists/, 'lo demás queda intacto');
});

test('grant a anon y authenticated en una sola línea: se quita sólo anon', () => {
  const known = new Map([['newsletter_subscribers', ['email']]]);
  const { sql } = stripPiiPublicRead('grant select on public.newsletter_subscribers to anon, authenticated;\n', known);
  assert.equal(sql, 'grant select on public.newsletter_subscribers to authenticated;\n');
});
