import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapProject, EXEC_SQL_DDL, RLS_TRIGGER_DDL } from './bootstrapProject.js';

// ---------------------------------------------------------------------------
// EXEC_SQL_DDL — el contrato congelado.
// ---------------------------------------------------------------------------
test('EXEC_SQL_DDL: el parámetro se llama `query` (opción a)', () => {
  assert.match(EXEC_SQL_DDL, /create or replace function public\.exec_sql\(query text\)/);
});

test('EXEC_SQL_DDL: el format() interno usa la variable `query`', () => {
  assert.match(EXEC_SQL_DDL, /format\('select .*\(%s\) t',\s*query\)/);
});

// Normalización del input: un ";" final rompe el subquery del format() y cae en
// la rama `exception`, que re-ejecuta descartando filas y devuelve '[]'.
// Confirmado empíricamente: "select 1 as ok" → 1 fila; "select 1 as ok;" → 0.
// String.raw es OBLIGATORIO en la expectativa: escrito '[;\s]+$' en un template
// normal, JS colapsa \s a s y la expectativa compararía contra [;s]+$ — un DDL
// que borraría las «s» finales de cualquier query (`from users` → `from user`).
const NORMALIZE_LINE = String.raw`query := regexp_replace(query, '[;\s]+$', '')`;

test("EXEC_SQL_DDL: normaliza el input — strip de ';' y whitespace finales", () => {
  // La expectativa misma lleva la barra invertida literal, no una `s` suelta.
  assert.equal(
    [...NORMALIZE_LINE].filter(c => c === '\\').length,
    1,
    'la expectativa perdió la barra invertida: no está congelando lo que cree'
  );
  assert.ok(
    EXEC_SQL_DDL.includes(NORMALIZE_LINE),
    'falta la normalización de ";" finales en el cuerpo de exec_sql'
  );
  assert.ok(
    !EXEC_SQL_DDL.includes('[;s]+$'),
    'el DDL emitido colapsó \\s a s: strip de «s» finales, no de whitespace'
  );
});

test('EXEC_SQL_DDL: la normalización es la primera operación sobre query', () => {
  const iNormalize = EXEC_SQL_DDL.indexOf(NORMALIZE_LINE);
  const iFormat = EXEC_SQL_DDL.indexOf('execute format(');
  assert.notEqual(iNormalize, -1);
  assert.ok(
    iNormalize < iFormat,
    'la normalización debe ir antes del wrap en format(), no después'
  );
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
// RLS_TRIGGER_DDL — el barrido de cobertura, congelado igual que EXEC_SQL_DDL.
// ---------------------------------------------------------------------------
test('RLS_TRIGGER_DDL: security definer con search_path fijado a public', () => {
  assert.match(RLS_TRIGGER_DDL, /security definer/);
  assert.match(RLS_TRIGGER_DDL, /set search_path = public/);
});

test('RLS_TRIGGER_DDL: dispara en ddl_command_end sobre CREATE TABLE', () => {
  assert.match(RLS_TRIGGER_DDL, /on ddl_command_end/);
  assert.match(RLS_TRIGGER_DDL, /when tag in \('CREATE TABLE'\)/);
});

test('RLS_TRIGGER_DDL: el drop event trigger va antes del create event trigger', () => {
  const iDrop = RLS_TRIGGER_DDL.indexOf('drop event trigger if exists');
  const iCreate = RLS_TRIGGER_DDL.indexOf('create event trigger');
  assert.notEqual(iDrop, -1);
  assert.notEqual(iCreate, -1);
  assert.ok(iDrop < iCreate, 'el drop debe ir antes del create, no después');
});

test('RLS_TRIGGER_DDL: dos ramas exception when others, ambas seguidas de null;', () => {
  const branches = RLS_TRIGGER_DDL.match(/exception when others then/g) ?? [];
  assert.equal(branches.length, 2, 'se esperan exactamente dos ramas exception when others');
  const guarded = RLS_TRIGGER_DDL.match(/exception when others then\s*\n\s*null;/g) ?? [];
  assert.equal(
    guarded.length,
    2,
    'las dos ramas exception when others deben ir seguidas de null; — nunca puede propagar y revertir el CREATE TABLE'
  );
});

test('RLS_TRIGGER_DDL: filtra por schema_name = public', () => {
  assert.match(RLS_TRIGGER_DDL, /obj\.schema_name = 'public'/);
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

test('bootstrapProject: 200 → resuelve y manda EXEC_SQL_DDL y RLS_TRIGGER_DDL, en ese orden, como envíos separados', async () => {
  const calls = [];
  await withFetch(
    async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 200, text: async () => '{}' };
    },
    async () => {
      await bootstrapProject('ref_ok', 'tok');
    }
  );
  assert.equal(calls.length, 2, 'se esperan dos envíos separados a la Management API');

  assert.equal(calls[0].url, 'https://api.supabase.com/v1/projects/ref_ok/database/query');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  assert.equal(JSON.parse(calls[0].opts.body).query, EXEC_SQL_DDL);

  assert.equal(calls[1].url, 'https://api.supabase.com/v1/projects/ref_ok/database/query');
  assert.equal(calls[1].opts.method, 'POST');
  assert.equal(calls[1].opts.headers.Authorization, 'Bearer tok');
  assert.equal(JSON.parse(calls[1].opts.body).query, RLS_TRIGGER_DDL);
});

test('bootstrapProject: EXEC_SQL_DDL ok pero RLS_TRIGGER_DDL falla → resuelve normal (no lanza)', async () => {
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(' '));

  let callCount = 0;
  try {
    await withFetch(
      async () => {
        callCount += 1;
        if (callCount === 1) {
          return { ok: true, status: 200, text: async () => '{}' };
        }
        return {
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ message: 'event trigger requires superuser' }),
        };
      },
      async () => {
        await assert.doesNotReject(() => bootstrapProject('ref_rls_fail', 'tok'));
      }
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(callCount, 2, 'ambos envíos deben intentarse aunque el segundo falle');
  assert.ok(
    logs.some(line => line.includes('[RLS_TRIGGER_FAILED:ref_rls_fail]') && line.includes('event trigger requires superuser')),
    'debe loguear [RLS_TRIGGER_FAILED:<ref>] con el mensaje completo'
  );
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
