import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTypeRepair, typeCheckTelemetry } from '../src/utils/typeRepairLoop.js';

test('typeCheckTelemetry: sufijo para forge_intent_log', () => {
  assert.equal(typeCheckTelemetry('errors', 3), ' [TYPE_ERRORS:3]');
  assert.equal(typeCheckTelemetry('unavailable', 0), ' [TYPECHECK_OFF]');
  assert.equal(typeCheckTelemetry('clean', 0), '');
  assert.equal(typeCheckTelemetry(undefined, 0), '');
});

// ---------------------------------------------------------------------------
// La segunda puerta del Verifier nunca empeora el resultado: sólo acepta una
// versión que compila y tiene MENOS errores de tipos; cualquier otra ronda se
// descarta y queda la última versión buena.
// ---------------------------------------------------------------------------

const issue = (file, code = 2339) => ({ file, line: 1, column: 1, code, message: `error ${code}` });
const files = (obj) => new Map(Object.entries(obj));
const ok = (errors, extra = {}) => ({ available: true, errors, unverifiable: [], fixedFiles: {}, autoFixed: 0, ...extra });

/** typecheck falso: el número de errores depende del contenido de A.tsx. */
function fakeTypecheck(table) {
  return async (fs, opts = {}) => {
    const key = fs.get('src/A.tsx');
    const entry = table[key];
    if (!entry) throw new Error(`sin respuesta para ${key}`);
    return opts.autoFix === false && entry.raw ? entry.raw : entry.result;
  };
}

test('limpio a la primera: no se llama al modelo', async () => {
  let repairs = 0;
  const out = await runTypeRepair({
    files: files({ 'src/A.tsx': 'v0' }),
    typecheck: fakeTypecheck({ v0: { result: ok([]) } }),
    compile: async () => true,
    repair: async () => { repairs++; return { files: null, calls: 1 }; },
    maxRounds: 2,
  });
  assert.equal(out.status, 'clean');
  assert.equal(repairs, 0);
  assert.equal(out.files.get('src/A.tsx'), 'v0');
});

test('arreglo automático de imports: se acepta si compila, sin modelo', async () => {
  const out = await runTypeRepair({
    files: files({ 'src/A.tsx': 'v0' }),
    typecheck: fakeTypecheck({ v0: { result: ok([], { fixedFiles: { 'src/A.tsx': 'v0-sin-imports' }, autoFixed: 2 }) } }),
    compile: async () => true,
    repair: async () => { throw new Error('no debería llamarse'); },
    maxRounds: 2,
  });
  assert.equal(out.status, 'clean');
  assert.equal(out.autoFixed, 2);
  assert.equal(out.files.get('src/A.tsx'), 'v0-sin-imports');
});

test('arreglo automático que rompe la compilación: se descarta y se revisa sin él', async () => {
  const out = await runTypeRepair({
    files: files({ 'src/A.tsx': 'v0' }),
    typecheck: fakeTypecheck({
      v0: { result: ok([], { fixedFiles: { 'src/A.tsx': 'roto' }, autoFixed: 1 }), raw: ok([issue('src/A.tsx', 6133)]) },
    }),
    compile: async (fs) => fs.get('src/A.tsx') !== 'roto',
    repair: async () => ({ files: null, calls: 0 }),
    maxRounds: 0,
  });
  assert.equal(out.files.get('src/A.tsx'), 'v0');
  assert.deepEqual(out.errors.map((e) => e.code), [6133]);
});

test('reparación con progreso se acepta; sin progreso se descarta y queda la última buena', async () => {
  const out = await runTypeRepair({
    files: files({ 'src/A.tsx': 'v0' }),
    typecheck: fakeTypecheck({
      v0: { result: ok([issue('src/A.tsx'), issue('src/A.tsx')]) },
      v1: { result: ok([issue('src/A.tsx')]) },
      v2: { result: ok([issue('src/A.tsx'), issue('src/B.tsx')]) }, // peor que v1
    }),
    compile: async () => true,
    repair: async (fs) => ({ files: files({ 'src/A.tsx': fs.get('src/A.tsx') === 'v0' ? 'v1' : 'v2' }), calls: 1 }),
    maxRounds: 2,
  });
  assert.equal(out.status, 'errors');
  assert.equal(out.files.get('src/A.tsx'), 'v1');
  assert.equal(out.errors.length, 1);
  assert.equal(out.fixCalls, 2);
  assert.equal(out.rounds, 2);
});

test('una reparación que rompe la compilación se descarta', async () => {
  const out = await runTypeRepair({
    files: files({ 'src/A.tsx': 'v0' }),
    typecheck: fakeTypecheck({ v0: { result: ok([issue('src/A.tsx')]) } }),
    compile: async (fs) => fs.get('src/A.tsx') === 'v0',
    repair: async () => ({ files: files({ 'src/A.tsx': 'no-compila' }), calls: 1 }),
    maxRounds: 2,
  });
  assert.equal(out.files.get('src/A.tsx'), 'v0');
  assert.equal(out.rounds, 1, 'no sigue intentando sobre una base rota');
});

test('reparación limpia en la primera ronda', async () => {
  const out = await runTypeRepair({
    files: files({ 'src/A.tsx': 'v0' }),
    typecheck: fakeTypecheck({ v0: { result: ok([issue('src/A.tsx')]) }, v1: { result: ok([]) } }),
    compile: async () => true,
    repair: async () => ({ files: files({ 'src/A.tsx': 'v1' }), calls: 1 }),
    maxRounds: 2,
  });
  assert.equal(out.status, 'clean');
  assert.equal(out.files.get('src/A.tsx'), 'v1');
  assert.equal(out.rounds, 1);
});

test('revisión no disponible: entrada intacta, sin modelo', async () => {
  const input = files({ 'src/A.tsx': 'v0' });
  const out = await runTypeRepair({
    files: input,
    typecheck: async () => ({ available: false, reason: 'typeenv not installed' }),
    compile: async () => true,
    repair: async () => { throw new Error('no debería llamarse'); },
    maxRounds: 2,
  });
  assert.equal(out.status, 'unavailable');
  assert.equal(out.files, input);
});

test('la revisión deja de estar disponible a mitad: no se acepta a ciegas', async () => {
  let calls = 0;
  const out = await runTypeRepair({
    files: files({ 'src/A.tsx': 'v0' }),
    typecheck: async () => (++calls === 1 ? ok([issue('src/A.tsx')]) : { available: false, reason: 'caído' }),
    compile: async () => true,
    repair: async () => ({ files: files({ 'src/A.tsx': 'v1' }), calls: 1 }),
    maxRounds: 2,
  });
  assert.equal(out.files.get('src/A.tsx'), 'v0');
  assert.equal(out.status, 'errors');
});

test('cancelación: se propaga como AbortError', async () => {
  await assert.rejects(
    runTypeRepair({
      files: files({ 'src/A.tsx': 'v0' }),
      typecheck: fakeTypecheck({ v0: { result: ok([issue('src/A.tsx')]) } }),
      compile: async () => true,
      repair: async () => ({ files: files({ 'src/A.tsx': 'v1' }), calls: 1 }),
      maxRounds: 2,
      isAborted: () => true,
    }),
    (err) => err.name === 'AbortError'
  );
});
