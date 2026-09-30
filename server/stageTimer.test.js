import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStageTimer } from '../src/utils/stageTimer.js';

test('cada etapa mide desde la marca anterior y el total desde el inicio', () => {
  let t = 0;
  const timer = createStageTimer(() => t);
  t = 3200; timer.mark('classify');
  t = 4200; timer.mark('target');
  t = 50200; timer.mark('edit');
  t = 71400;
  assert.equal(timer.summary(), 'classify 3.2s · target 1.0s · edit 46.0s · total 71.4s');
});
