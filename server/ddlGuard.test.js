import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findDestructiveDDL,
  destructiveTargets,
  isDestructiveDDL,
  maskSqlNoise,
  splitStatements,
  DROP,
  TRUNCATE,
  DELETE_WITHOUT_WHERE,
  DROP_COLUMN,
} from '../src/utils/ddlGuard.js';

// ---------------------------------------------------------------------------
// ddlGuard — detector determinista de DDL destructivo.
//
// El módulo todavía NO tiene consumidor: lo llamará el botón de aprobación de
// Cirugía 2, que necesita saber ANTES de pintarse si el SQL que va a correr
// borra datos. Estos tests son la razón por la que ese botón podrá nacer sobre
// lógica ya verde en vez de traer su propio detector sin probar.
//
// Los dos ejes que cubren:
//  (a) que dispare con lo destructivo de verdad, en sus variantes de sintaxis;
//  (b) que NO dispare con lo que sólo se le PARECE — un `drop` dentro de un
//      comentario, de un literal, del cuerpo de una función, o de un nombre de
//      tabla. Un falso positivo aquí bloquearía migraciones legítimas, que es
//      la forma en que un guard se gana que lo apaguen.
// ---------------------------------------------------------------------------

const kinds = (sql) => findDestructiveDDL(sql).map((f) => f.kind);

test('DROP TABLE dispara kind=drop', () => {
  assert.deepEqual(kinds('drop table users;'), [DROP]);
  assert.deepEqual(kinds('DROP TABLE IF EXISTS public.users CASCADE;'), [DROP]);
});

test('DROP de cualquier objeto dispara (no sólo tablas)', () => {
  for (const sql of [
    'drop view v_orders;',
    'drop materialized view mv_stats;',
    'drop type order_status;',
    'drop index idx_users_email;',
    'drop function calc_total(int);',
    'drop policy p_select on orders;',
    'drop schema analytics cascade;',
  ]) {
    assert.deepEqual(kinds(sql), [DROP], sql);
  }
});

test('TRUNCATE dispara kind=truncate', () => {
  assert.deepEqual(kinds('truncate table sessions;'), [TRUNCATE]);
  assert.deepEqual(kinds('TRUNCATE sessions RESTART IDENTITY CASCADE;'), [TRUNCATE]);
});

test('DELETE sin WHERE dispara; con WHERE no', () => {
  assert.deepEqual(kinds('delete from carts;'), [DELETE_WITHOUT_WHERE]);
  assert.deepEqual(kinds("delete from carts where created_at < now() - interval '30 days';"), []);
  // El WHERE acota el borrado: eso es exactamente lo que separa un cleanup de
  // una catástrofe, así que el guard tiene que notar la diferencia.
  assert.equal(isDestructiveDDL('delete from carts where id = 1;'), false);
});

test('un WHERE que vive DENTRO de un literal no acota nada', () => {
  assert.deepEqual(kinds("delete from logs;\n-- where id = 1"), [DELETE_WITHOUT_WHERE]);
  assert.deepEqual(kinds("insert into notes(body) values ('delete from x where y');"), []);
});

test('ALTER … DROP COLUMN dispara, con y sin la palabra COLUMN', () => {
  assert.deepEqual(kinds('alter table users drop column legacy_flag;'), [DROP_COLUMN]);
  assert.deepEqual(kinds('alter table users drop legacy_flag;'), [DROP_COLUMN]);
  assert.deepEqual(kinds('alter table users drop column if exists legacy_flag;'), [DROP_COLUMN]);
});

test('ALTER … DROP de una RESTRICCIÓN no es un DROP COLUMN', () => {
  // Quitan una restricción o un default: ni la columna ni sus filas se van.
  assert.deepEqual(kinds('alter table users alter column email drop default;'), []);
  assert.deepEqual(kinds('alter table users alter column email drop not null;'), []);
  assert.deepEqual(kinds('alter table users drop constraint users_email_key;'), []);
});

test('ALTER … ADD COLUMN es la migración feliz y no dispara', () => {
  assert.equal(isDestructiveDDL('alter table users add column nickname text;'), false);
  assert.equal(
    isDestructiveDDL('create table orders (id uuid primary key, total numeric not null);'),
    false
  );
});

test('un DROP comentado no dispara', () => {
  assert.deepEqual(kinds('-- drop table users;\ncreate table users (id int);'), []);
  assert.deepEqual(kinds('/* drop table users; */ create table users (id int);'), []);
});

test('comentarios de bloque ANIDADOS (Postgres los anida) se enmascaran enteros', () => {
  const sql = '/* outer /* inner drop table users; */ still comment */ create table t (id int);';
  assert.deepEqual(kinds(sql), []);
});

test('un DROP dentro del cuerpo $$…$$ de una función no dispara', () => {
  // Sin dollar-quoting esto sería un falso positivo, y el cuerpo plpgsql es el
  // sitio más normal del mundo para que aparezca la palabra drop.
  const sql = [
    'create or replace function audit() returns trigger as $$',
    'begin',
    "  raise notice 'drop table users';",
    '  return new;',
    'end;',
    '$$ language plpgsql;',
  ].join('\n');
  assert.deepEqual(kinds(sql), []);
});

test('un identificador citado que contiene "drop" no dispara', () => {
  assert.deepEqual(kinds('create table "drop table users" (id int);'), []);
  assert.deepEqual(kinds('create table drop_log (id int);'), []);
});

test('DROP debe ser el VERBO de la sentencia, no una palabra suelta', () => {
  assert.deepEqual(kinds('select drop_count from stats;'), []);
});

test('varias sentencias: cada una se juzga por separado, en orden de archivo', () => {
  const sql = [
    'create table a (id int);',
    'drop table b;',
    'alter table c drop column d;',
    'truncate e;',
    'delete from f;',
  ].join('\n');
  assert.deepEqual(kinds(sql), [DROP, DROP_COLUMN, TRUNCATE, DELETE_WITHOUT_WHERE]);
});

test('cada hallazgo reporta la línea real del original', () => {
  const sql = ['create table a (id int);', '', '-- limpieza', 'drop table b;'].join('\n');
  const [finding] = findDestructiveDDL(sql);
  assert.equal(finding.kind, DROP);
  assert.equal(finding.line, 4);
});

test('un `;` dentro de un literal no parte la sentencia', () => {
  const statements = splitStatements("insert into t(v) values ('a;b'); select 1;");
  assert.equal(statements.length, 2);
  assert.match(statements[0].text, /^insert into t/);
});

test('maskSqlNoise preserva longitud y saltos de línea', () => {
  const sql = "-- nota\nselect 'x;y' from t;\n/* fin */";
  const masked = maskSqlNoise(sql);
  assert.equal(masked.length, sql.length);
  assert.equal(
    masked.split('\n').length,
    sql.split('\n').length,
    'los números de línea calculados sobre la máscara valen sobre el original'
  );
  assert.ok(!masked.includes('nota'));
  assert.ok(masked.includes('select'));
});

test('entrada vacía o basura no revienta ni inventa hallazgos', () => {
  for (const input of ['', '   ', ';;;', null, undefined]) {
    assert.deepEqual(findDestructiveDDL(input), []);
    assert.equal(isDestructiveDDL(input), false);
  }
});

test('determinismo: mismo texto, mismos hallazgos', () => {
  const sql = 'drop table a; alter table b drop column c; delete from d;';
  assert.deepEqual(findDestructiveDDL(sql), findDestructiveDDL(sql));
});

// ---------------------------------------------------------------------------
// EL OBJETO AFECTADO (`target`) — lo que el modal de Cirugía 2 pide teclear.
//
// El modal destructivo no se contenta con un "¿seguro?": enseña las sentencias
// marcadas y exige que el usuario escriba el nombre de lo que va a destruir.
// Ese nombre sale de aquí, así que un `target` equivocado es un modal que pide
// teclear una cosa mientras borra otra.
// ---------------------------------------------------------------------------

const targets = (sql) => findDestructiveDDL(sql).map((f) => f.target);

test('el target de un DROP es el objeto, sin esquema ni adornos', () => {
  assert.deepEqual(targets('drop table users;'), ['users']);
  assert.deepEqual(targets('DROP TABLE IF EXISTS public.users CASCADE;'), ['users']);
  assert.deepEqual(targets('drop materialized view mv_stats;'), ['mv_stats']);
  assert.deepEqual(targets('drop index concurrently if exists idx_orders;'), ['idx_orders']);
});

test('DROP POLICY … ON t reporta la TABLA, que es lo afectado', () => {
  assert.deepEqual(targets('drop policy p_read on public.orders;'), ['orders']);
  assert.deepEqual(targets('drop trigger t_audit on orders;'), ['orders']);
});

test('el target de TRUNCATE y DELETE es la tabla que vacían', () => {
  assert.deepEqual(targets('truncate table sessions;'), ['sessions']);
  assert.deepEqual(targets('TRUNCATE ONLY sessions RESTART IDENTITY CASCADE;'), ['sessions']);
  assert.deepEqual(targets('delete from carts;'), ['carts']);
  assert.deepEqual(targets('delete from public.carts;'), ['carts']);
});

test('el target de un DROP COLUMN es la TABLA, no la columna', () => {
  assert.deepEqual(targets('alter table public.users drop column legacy_flag;'), ['users']);
  assert.deepEqual(targets('alter table users drop legacy_flag;'), ['users']);
  assert.deepEqual(targets('alter table if exists only users drop column a, drop column b;'), [
    'users',
    'users',
  ]);
});

test('un identificador entrecomillado conserva su nombre real', () => {
  assert.deepEqual(targets('drop table "user orders";'), ['user orders']);
  assert.deepEqual(targets('alter table public."user orders" drop column x;'), ['user orders']);
});

test('destructiveTargets deduplica, ordena por aparición y descarta vacíos', () => {
  const findings = findDestructiveDDL(
    'drop table a; truncate a; delete from b; alter table c drop column d;'
  );
  assert.deepEqual(destructiveTargets(findings), ['a', 'b', 'c']);
  assert.deepEqual(destructiveTargets([{ target: '' }, { target: '  ' }, {}]), []);
  assert.deepEqual(destructiveTargets(null), []);
});

test('el target no se inventa cuando la sentencia no nombra nada', () => {
  // `drop table 123` no es SQL válido, pero el guard lo marca igual (arranca
  // por el verbo destructivo) y ahí no hay identificador que leer. El modal
  // trata un target vacío como fail-closed: no ofrece confirmación tecleada
  // para algo que no sabe nombrar.
  assert.deepEqual(targets('drop table 123;'), ['']);
  assert.deepEqual(destructiveTargets(findDestructiveDDL('drop table 123;')), []);
});
