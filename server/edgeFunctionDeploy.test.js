import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEdgeFunctionDeployRequest } from './edgeFunctionDeploy.js';
import { requireAuth, requireProjectOwnership } from '../server.js';

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/edge-functions/deploy — Bloque 1 (A+B).
//
// El endpoint delega su decisión de 400/409 en `validateEdgeFunctionDeployRequest`
// (pura, sin Express ni Supabase) y reutiliza exactamente `requireAuth` /
// `requireProjectOwnership` — las mismas guardas que ya protegen el resto de
// rutas /api/db/*. Se testean aquí directamente, sin levantar un servidor
// real ni depender de credenciales de Supabase (este entorno de test no las
// tiene): `requireAuth` corta en 401 ANTES de tocar el admin client
// (comprobación del header primero), y `requireProjectOwnership` acepta un
// admin client inyectado para el caso 403.
// ---------------------------------------------------------------------------

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}

test('validateEdgeFunctionDeployRequest — 409 NO_PROJECT_DB cuando el ref es null', () => {
  const result = validateEdgeFunctionDeployRequest({
    slug: 'send-email',
    code: 'export default () => {}',
    projectRef: null,
  });
  assert.deepEqual(result, {
    ok: false,
    status: 409,
    code: 'NO_PROJECT_DB',
    error: 'Project database not provisioned',
  });
});

test('validateEdgeFunctionDeployRequest — 409 NO_PROJECT_DB cuando el ref es cadena vacía', () => {
  const result = validateEdgeFunctionDeployRequest({
    slug: 'send-email',
    code: 'export default () => {}',
    projectRef: '',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.code, 'NO_PROJECT_DB');
});

test('validateEdgeFunctionDeployRequest — 400 con slug inválido, aunque el ref exista', () => {
  const result = validateEdgeFunctionDeployRequest({
    slug: 'Send Email!',
    code: 'export default () => {}',
    projectRef: 'abcdefgh',
  });
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    code: 'INVALID_INPUT',
    error: 'Invalid slug or code',
  });
});

test('validateEdgeFunctionDeployRequest — 400 cuando code no es string', () => {
  const result = validateEdgeFunctionDeployRequest({
    slug: 'send-email',
    code: undefined,
    projectRef: 'abcdefgh',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.code, 'INVALID_INPUT');
});

test('validateEdgeFunctionDeployRequest — el slug inválido gana sobre NO_PROJECT_DB', () => {
  // Un slug malformado sigue siendo inválido tenga o no el proyecto su base
  // provisionada: el error del CLIENTE se revisa primero.
  const result = validateEdgeFunctionDeployRequest({
    slug: 'Bad Slug',
    code: 'export default () => {}',
    projectRef: null,
  });
  assert.equal(result.status, 400);
  assert.equal(result.code, 'INVALID_INPUT');
});

test('validateEdgeFunctionDeployRequest — ok cuando slug, code y ref son válidos', () => {
  const result = validateEdgeFunctionDeployRequest({
    slug: 'send-email',
    code: 'export default () => {}',
    projectRef: 'abcdefgh',
  });
  assert.deepEqual(result, { ok: true });
});

test('requireAuth — 401 sin header Authorization', async () => {
  const req = { headers: {} };
  const res = fakeRes();
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('requireAuth — 401 con header Authorization mal formado (sin Bearer)', async () => {
  const req = { headers: { authorization: 'Token abc123' } };
  const res = fakeRes();
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('requireProjectOwnership — 403 cuando el proyecto pertenece a otro usuario', async () => {
  const projectId = 'proj-1';
  const req = { userId: 'user-a' };
  const res = fakeRes();

  // Admin client falso, inyectado — no toca ninguna Supabase real. Devuelve
  // el mismo shape que supabaseAdmin.from(...).select(...).eq(...).single().
  const fakeAdmin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  return { data: { user_id: 'user-b' }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const allowed = await requireProjectOwnership(req, res, projectId, fakeAdmin);
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 403);
});

test('requireProjectOwnership — pasa cuando el proyecto pertenece al usuario autenticado', async () => {
  const projectId = 'proj-1';
  const req = { userId: 'user-a' };
  const res = fakeRes();

  const fakeAdmin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  return { data: { user_id: 'user-a' }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const allowed = await requireProjectOwnership(req, res, projectId, fakeAdmin);
  assert.equal(allowed, true);
  assert.equal(res.statusCode, null);
});

test('requireProjectOwnership — 404 cuando el proyecto no existe', async () => {
  const projectId = 'missing';
  const req = { userId: 'user-a' };
  const res = fakeRes();

  const fakeAdmin = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  return { data: null, error: { message: 'not found' } };
                },
              };
            },
          };
        },
      };
    },
  };

  const allowed = await requireProjectOwnership(req, res, projectId, fakeAdmin);
  assert.equal(allowed, false);
  assert.equal(res.statusCode, 404);
});
