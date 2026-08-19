import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapProject, EXEC_SQL_DDL } from './bootstrapProject.js';

// ---------------------------------------------------------------------------
// EXEC_SQL_DDL — el contrato congelado.
// ---------------------------------------------------------------------------
test('EXEC_SQL_DDL: el parámetro se llama `query` (opción a)', () => {
  assert.match(EXEC_SQL_DDL, /create or replace function public\.exec_sql\(query text\)/);
});

test('EXEC_SQL_DDL: el format() interno usa la variable `query`', () => {
  assert.match(EXEC_SQL_DDL, /format\('select .*\(%s\) t',\s*query\)/);
});

// La rama de excepción para statements no row-returning (DDL, DML sin
// RETURNING). Congelación ESTÁTICA sobre el string del DDL: la validación
// funcional viva llega en el checkpoint contra la fixture.
test('EXEC_SQL_DDL: existe la rama exception when others', () => {
  assert.match(EXEC_SQL_DDL, /^\s*exception\s*$/m);
  assert.match(EXEC_SQL_DDL, /when others then/);
});

test('EXEC_SQL_DDL: la rama ejecuta el query directo, sin envoltorio', () => {
  assert.match(EXEC_SQL_DDL, /when others then[\s\S]*?execute query;/);
  // El `execute query` directo va DESPUÉS del format() envuelto, no en su lugar.
  assert.ok(EXEC_SQL_DDL.indexOf('execute format(') < EXEC_SQL_DDL.indexOf('execute query;'));
});

test("EXEC_SQL_DDL: la rama devuelve '[]'::jsonb", () => {
  assert.match(EXEC_SQL_DDL, /when others then[\s\S]*?execute query;[\s\S]*?return '\[\]'::jsonb;/);
});

test('EXEC_SQL_DDL: los dos caminos devuelven jsonb (contrato de retorno único)', () => {
  assert.match(EXEC_SQL_DDL, /returns jsonb/);
  const returns = EXEC_SQL_DDL.match(/^\s*return .*/gm) ?? [];
  assert.equal(returns.length, 2, 'se esperan exactamente dos return: SELECT y rama de excepción');
});

test('EXEC_SQL_DDL: security definer con search_path fijado a public', () => {
  assert.match(EXEC_SQL_DDL, /security definer/);
  assert.match(EXEC_SQL_DDL, /set search_path = public/);
});

test('EXEC_SQL_DDL: revoca de public, anon y authenticated', () => {
  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(
      EXEC_SQL_DDL,
      new RegExp(`revoke all on function public\\.exec_sql\\(text\\) from ${role};`),
      `falta el revoke de ${role}`
    );
  }
});

test('EXEC_SQL_DDL: el único grant es a service_role', () => {
  const grants = EXEC_SQL_DDL.match(/grant .*/g) ?? [];
  assert.equal(grants.length, 1);
  assert.match(grants[0], /grant execute on function public\.exec_sql\(text\) to service_role;/);
});

test('EXEC_SQL_DDL: es idempotente (create OR REPLACE, no create a secas)', () => {
  assert.ok(!/create function/.test(EXEC_SQL_DDL));
  assert.match(EXEC_SQL_DDL, /create or replace function/);
});

// ---------------------------------------------------------------------------
// bootstrapProject — contrato de error: LANZA, nunca resuelve en silencio.
// ---------------------------------------------------------------------------
function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return fn().finally(() => { globalThis.fetch = original; });
}

test('bootstrapProject: sin ref lanza', async () => {
  await assert.rejects(() => bootstrapProject('', 'tok'), /missing project ref/);
});

test('bootstrapProject: sin management token lanza y conserva el ref', async () => {
  await assert.rejects(
    () => bootstrapProject('abc123', ''),
    err => {
      assert.match(err.message, /missing Supabase management token/);
      assert.equal(err.ref, 'abc123');
      return true;
    }
  );
});

test('bootstrapProject: 200 → resuelve y manda el DDL al ref correcto', async () => {
  let seen = null;
  await withFetch(
    async (url, opts) => {
      seen = { url, opts };
      return { ok: true, status: 200, text: async () => '{}' };
    },
    async () => {
      await bootstrapProject('ref_ok', 'tok');
    }
  );
  assert.equal(seen.url, 'https://api.supabase.com/v1/projects/ref_ok/database/query');
  assert.equal(seen.opts.method, 'POST');
  assert.equal(seen.opts.headers.Authorization, 'Bearer tok');
  assert.equal(JSON.parse(seen.opts.body).query, EXEC_SQL_DDL);
});

test('bootstrapProject: Management API no-ok lanza con ref, status y mensaje completo', async () => {
  await withFetch(
    async () => ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ message: 'insufficient privileges on project' }),
    }),
    async () => {
      await assert.rejects(
        () => bootstrapProject('ref_bad', 'tok'),
        err => {
          assert.equal(err.ref, 'ref_bad');
          assert.equal(err.status, 403);
          // El mensaje COMPLETO viaja en el Error (log server-side), no al cliente.
          assert.match(err.message, /403/);
          assert.match(err.message, /insufficient privileges on project/);
          return true;
        }
      );
    }
  );
});

test('bootstrapProject: body no-JSON (HTML de infra) no rompe el manejo de error', async () => {
  await withFetch(
    async () => ({ ok: false, status: 502, text: async () => '<html>bad gateway</html>' }),
    async () => {
      await assert.rejects(
        () => bootstrapProject('ref_html', 'tok'),
        err => {
          assert.equal(err.status, 502);
          assert.match(err.message, /bad gateway/);
          return true;
        }
      );
    }
  );
});

test('bootstrapProject: fallo de red lanza conservando el ref', async () => {
  await withFetch(
    async () => { throw new Error('ECONNRESET'); },
    async () => {
      await assert.rejects(
        () => bootstrapProject('ref_net', 'tok'),
        err => {
          assert.equal(err.ref, 'ref_net');
          assert.match(err.message, /network failure — ECONNRESET/);
          return true;
        }
      );
    }
  );
});
