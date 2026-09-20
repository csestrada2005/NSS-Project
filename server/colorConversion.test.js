import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToHslString } from '../src/utils/colorConversion.js';

test('hexToHslString — rojo puro', () => {
  assert.equal(hexToHslString('#FF0000'), '0 100% 50%');
});

test('hexToHslString — el color de Coffee Shop de la DB (#78350F)', () => {
  assert.equal(hexToHslString('#78350F'), '22 78% 26%');
});

test('hexToHslString — acepta sin # inicial', () => {
  assert.equal(hexToHslString('FF0000'), hexToHslString('#FF0000'));
});

test('hexToHslString — gris (sin saturación)', () => {
  assert.equal(hexToHslString('#808080'), '0 0% 50%');
});

test('hexToHslString — hex inválido devuelve null, nunca revienta', () => {
  assert.equal(hexToHslString('not-a-color'), null);
  assert.equal(hexToHslString('#ZZZZZZ'), null);
  assert.equal(hexToHslString(''), null);
  assert.equal(hexToHslString(undefined), null);
});
