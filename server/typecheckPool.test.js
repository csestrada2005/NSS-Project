import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runTypecheck } from './typecheckPool.js';
import { DEFAULT_TYPEENV_DIR } from './typecheck.js';

// El pool corre la revisión en un hilo aparte: responde lo mismo que
// typecheckProject, atiende revisiones simultáneas en cola, y no deja el
// proceso colgado al terminar (si lo dejara, este archivo nunca acabaría).

const installed = fs.existsSync(path.join(DEFAULT_TYPEENV_DIR, 'node_modules', 'typescript', 'package.json'));
const skip = installed ? false : 'server/typeenv no está instalado';

const BROKEN = "import React from 'react';\nexport const A = () => <div>{(1 as number).nope}</div>;\n";

test('revisiones simultáneas en el worker, cada una con su propio resultado', { skip }, async () => {
  const [fixed, raw] = await Promise.all([
    runTypecheck({ 'src/A.tsx': BROKEN }),
    runTypecheck({ 'src/A.tsx': BROKEN }, { autoFix: false }),
  ]);
  assert.equal(fixed.available, true);
  assert.deepEqual(fixed.errors.map((e) => e.code), [2339]);
  assert.equal(fixed.autoFixed, 1);
  assert.deepEqual(raw.errors.map((e) => e.code), [6133, 2339]);
  assert.deepEqual(raw.fixedFiles, {});
});
