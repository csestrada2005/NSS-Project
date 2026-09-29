import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPlatformAdmin, planRoleDecision, REQUESTABLE_ROLES } from './roleDecision.js';

// ---------------------------------------------------------------------------
// roleDecision — la aprobación de roles de la plataforma vive en el servidor.
// Lo que se protege: sólo un admin decide, sólo sobre una petición
// viva, y el resultado nunca asigna algo que no se pidió.
// ---------------------------------------------------------------------------

const pending = (pending_role) => ({ id: 'u1', role: null, pending_role, role_approved: false });

test('isPlatformAdmin: mismo criterio que el resto del servidor (role === admin)', () => {
  assert.equal(isPlatformAdmin({ role: 'admin', role_approved: true }), true);
  assert.equal(isPlatformAdmin({ role: 'admin', role_approved: false }), true);
  assert.equal(isPlatformAdmin({ role: 'dev', role_approved: true }), false);
  assert.equal(isPlatformAdmin(null), false);
});

test('aprobar asigna EXACTAMENTE el rol pedido y cierra la petición', () => {
  for (const role of REQUESTABLE_ROLES) {
    const plan = planRoleDecision(pending(role), 'approve');
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.update, { role, role_approved: true, pending_role: null });
    assert.equal(plan.notification.type, 'role_approved');
  }
});

test('rechazar limpia la petición sin tocar el rol', () => {
  const plan = planRoleDecision(pending('admin'), 'reject');
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.update, { pending_role: null, role_approved: false });
  assert.equal('role' in plan.update, false);
  assert.equal(plan.notification.type, 'role_rejected');
});

test('no se decide sobre un usuario que ya tiene rol (doble click, pestaña vieja)', () => {
  const plan = planRoleDecision({ id: 'u1', role: 'dev', pending_role: 'admin', role_approved: true }, 'approve');
  assert.deepEqual(plan, { ok: false, status: 409, error: 'User already has a role' });
});

test('sin petición viva, usuario inexistente, decisión o rol inválidos → error', () => {
  assert.equal(planRoleDecision(pending(null), 'approve').status, 409);
  assert.equal(planRoleDecision(null, 'approve').status, 404);
  assert.equal(planRoleDecision(pending('dev'), 'promote').status, 400);
  assert.equal(planRoleDecision(pending('superuser'), 'approve').status, 400);
});
