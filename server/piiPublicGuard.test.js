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
  assert.deepEqual(stripPiiPublicRead(expeditions), { sql: expeditions, tables: [] });
});

test('detecta las columnas personales y no confunde restricciones con columnas', () => {
  const sql = `create table clientes (id uuid primary key, telefono text, direccion text, constraint u unique (telefono));`;
  assert.deepEqual(piiTablesInSql(sql).get('clientes'), ['telefono', 'direccion']);
});
