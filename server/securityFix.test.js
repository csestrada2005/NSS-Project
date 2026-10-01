import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSecurityFixPrompt, filesFingerprint, findingInstruction, isSecurityFixRequest } from '../src/utils/securityFix.js';

// Hallazgos reales del chequeo de Vertigo (2026-10-01).
const findings = [
  { severity: 'grave', kind: 'public_pii_read', table: 'app_users', policy: 'wyrd_public_read', columns: ['email'] },
  { severity: 'grave', kind: 'client_secret', path: 'src/components/sections/AdminClientCheckPanel.tsx' },
  { severity: 'grave', kind: 'client_role_write', path: 'src/components/sections/AdminClientCheckPanel.tsx', table: 'client_check_g6' },
  { severity: 'aviso', kind: 'edge_no_caller_check', path: 'supabase/functions/manage-users/index.ts' },
];
const es = (_k, p) => `Arregla estos problemas de seguridad del proyecto, sin quitar ninguna funcionalidad:\n${p.list}`;

test('el pedido trae una instrucción concreta por hallazgo y las reglas de migración', () => {
  const prompt = buildSecurityFixPrompt(findings, es);
  assert.equal(isSecurityFixRequest(prompt), true);
  assert.match(prompt, /policy "wyrd_public_read" lets ANYONE \(anon\) read personal columns \(email\)/);
  assert.match(prompt, /AdminClientCheckPanel\.tsx contains a secret key/);
  assert.match(prompt, /writes roles in table "client_check_g6"/);
  assert.match(prompt, /supabase\.auth\.getUser\(token\)/);
  assert.match(prompt, /never edit a migration file that is already applied/);
});

test('isSecurityFixRequest: los dos idiomas, sólo al inicio', () => {
  assert.equal(isSecurityFixRequest('Fix these security issues in the project, without removing any feature:\n- x'), true);
  assert.equal(isSecurityFixRequest('¿Arregla estos problemas de seguridad del proyecto?'), false);
  assert.equal(isSecurityFixRequest('arregla el botón'), false);
  assert.equal(isSecurityFixRequest(undefined), false);
});

test('cada tipo de hallazgo tiene su instrucción', () => {
  for (const kind of ['public_pii_read', 'public_write', 'rls_off', 'public_insert_privileged', 'client_secret', 'client_role_write', 'edge_no_caller_check']) {
    assert.doesNotMatch(findingInstruction({ kind, table: 't', path: 'p', policy: 'x', columns: ['c'] }), new RegExp(`^- ${kind}:`), kind);
  }
});

test('la huella cambia con cualquier cambio y no depende del orden', () => {
  const a = new Map([['src/App.tsx', 'x'], ['src/B.tsx', 'y']]);
  const b = new Map([['src/B.tsx', 'y'], ['src/App.tsx', 'x']]);
  assert.equal(filesFingerprint(a), filesFingerprint(b));
  assert.notEqual(filesFingerprint(a), filesFingerprint(new Map([['src/App.tsx', 'x!'], ['src/B.tsx', 'y']])));
  assert.notEqual(filesFingerprint(a), filesFingerprint(new Map([['src/App.tsx', 'x']])));
});
