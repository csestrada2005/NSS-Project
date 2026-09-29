import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rlsPolicyWarnings } from '../src/utils/rlsPolicyGuard.js';
import { clientCodeWarnings } from '../src/utils/clientCodeGuard.js';
import { buildTrimWarning, TRIM_MAX_STEPS } from '../src/utils/planTrim.js';
import {
  buildOutcomeMessage,
  ddlProposedMark,
  resolveDdlProposals,
  EXECUTABLE,
  OUTCOME_APPLIED,
  OUTCOME_FAILED,
  OUTCOME_UNVERIFIED,
  OUTCOME_SKIPPED,
} from '../src/utils/ddlProposalState.js';

// ---------------------------------------------------------------------------
// i18n de Wyrd Forge (ítem 5.4) — los avisos que el chat muestra salen en el
// idioma que eligió el usuario. Los módulos reciben `lang`; sin él conservan
// el idioma histórico (los tests de cada módulo siguen fijando ese texto).
// Lo que se protege aquí: (1) que el otro idioma exista y diga lo mismo, y
// (2) que el idioma NUNCA cambie lo que se relee del historial (las marcas).
// ---------------------------------------------------------------------------

const MIG = 'supabase/migrations/20260929120000_create_orders.sql';

test('rlsPolicyWarnings en inglés: los tres casos de tabla y el ilegible', () => {
  const findings = [
    { table: 'app_users', command: 'delete', path: MIG, reason: 'public-write-policy' },
    { table: 'app_users', command: null, path: MIG, reason: 'missing-rls', roleTable: true },
    { table: 'roles', command: null, path: MIG, reason: 'missing-rls', roleTable: true },
    { table: 'notes', command: null, path: MIG, reason: 'missing-rls', roleTable: false },
    { table: null, command: null, path: 'supabase/migrations/x.sql', reason: 'unparseable' },
  ];
  const en = rlsPolicyWarnings(findings, 'en');
  const es = rlsPolicyWarnings(findings);

  assert.equal(en.length, es.length, 'mismo número de avisos en los dos idiomas');
  assert.match(en[0], /^Security guard: .*app_users.*public delete polic/);
  assert.match(en[1], /roles .*server function/);
  assert.match(en[2], /notes; I turned it on/);
  assert.equal(en[2].includes('server function'), false, 'tabla sin rol: no inventa la función de servidor');
  assert.match(en[3], /couldn't check .*x\.sql/);
  for (const w of en) assert.equal(/Guard de seguridad|No pude/.test(w), false, w);
  // Sin `lang`: el texto histórico en español.
  assert.match(es[0], /^Guard de seguridad/);
});

test('clientCodeWarnings en inglés: credencial escrita y escritura en tabla de rol', () => {
  const findings = [
    { path: 'src/pay.ts', reason: 'hardcoded-credential', identifier: 'STRIPE_SECRET_KEY', table: null, method: null },
    { path: 'src/Admin.tsx', reason: 'role-table-write', identifier: null, table: 'user_roles', method: 'update' },
  ];
  const en = clientCodeWarnings(findings, 'en');
  assert.equal(en.length, 2);
  assert.match(en[0], /^Security guard: I found a credential \("STRIPE_SECRET_KEY"\) written directly in src\/pay\.ts/);
  assert.match(en[1], /src\/Admin\.tsx writes directly \(update\) to "user_roles"/);
  assert.match(clientCodeWarnings(findings)[0], /^Guard de seguridad/);
});

test('buildTrimWarning en español, con los mismos números reales', () => {
  const es = buildTrimWarning(12, TRIM_MAX_STEPS, 'es');
  assert.match(es, new RegExp(`^Este pedido necesitaba 12 pasos\\. Sólo se construyeron ${TRIM_MAX_STEPS} \\(tope: ${TRIM_MAX_STEPS} pasos`));
  assert.match(buildTrimWarning(12, TRIM_MAX_STEPS + 1, 'es'), /se amplió/);
  assert.equal(buildTrimWarning(5, 5, 'es'), '', 'sin recorte no hay aviso en ningún idioma');
  assert.match(buildTrimWarning(12, TRIM_MAX_STEPS), /^This request needed 12 steps/);
});

test('buildOutcomeMessage: el idioma cambia el texto, nunca la marca que se relee', () => {
  for (const outcome of [OUTCOME_APPLIED, OUTCOME_FAILED, OUTCOME_UNVERIFIED, OUTCOME_SKIPPED]) {
    const es = buildOutcomeMessage({ outcome, paths: [MIG], tables: ['orders'], reason: 'boom' });
    const en = buildOutcomeMessage({ outcome, paths: [MIG], tables: ['orders'], reason: 'boom' }, 'en');
    const markOf = (s) => s.slice(s.lastIndexOf(' ['));
    assert.equal(markOf(en), markOf(es), `${outcome}: misma marca`);
    assert.notEqual(en, es, `${outcome}: texto distinto`);

    const proposal = { role: 'assistant', content: `Done. Modified: ${MIG}${ddlProposedMark([MIG])}` };
    const [resolved] = resolveDdlProposals([proposal, { role: 'assistant', content: en }]);
    assert.equal(resolved.outcome, outcome, `${outcome}: el veredicto en inglés se relee igual`);
    assert.notEqual(resolved.state, EXECUTABLE);
  }
  const applied = buildOutcomeMessage({ outcome: OUTCOME_APPLIED, paths: [MIG], tables: ['orders'] }, 'en');
  assert.match(applied, /^Migration applied: .*schema changed in: orders\./);
});
