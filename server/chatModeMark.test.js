import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendModeMark, parseModeMark } from '../src/utils/chatModeMark.js';

test('appendModeMark: appends the mark for auto and plan', () => {
  assert.equal(appendModeMark('agrega testimonios', 'auto'), 'agrega testimonios [MODE:auto]');
  assert.equal(appendModeMark('agrega testimonios', 'plan'), 'agrega testimonios [MODE:plan]');
});

test('appendModeMark: leaves content untouched for an unknown mode', () => {
  assert.equal(appendModeMark('agrega testimonios', /** @type {any} */ ('yolo')), 'agrega testimonios');
  assert.equal(appendModeMark('agrega testimonios', /** @type {any} */ (undefined)), 'agrega testimonios');
});

test('parseModeMark: round-trips auto and plan', () => {
  assert.deepEqual(parseModeMark('agrega testimonios [MODE:auto]'), { text: 'agrega testimonios', mode: 'auto' });
  assert.deepEqual(parseModeMark('agrega testimonios [MODE:plan]'), { text: 'agrega testimonios', mode: 'plan' });
});

test('parseModeMark: content without a mark comes back with mode null and text untouched', () => {
  assert.deepEqual(parseModeMark('agrega testimonios'), { text: 'agrega testimonios', mode: null });
});

test('parseModeMark: only matches at the end of the string', () => {
  const withNoise = 'agrega [MODE:auto] testimonios';
  assert.deepEqual(parseModeMark(withNoise), { text: withNoise, mode: null });
});

test('parseModeMark: rejects an unknown mode value inside the mark shape', () => {
  const bogus = 'agrega testimonios [MODE:yolo]';
  assert.deepEqual(parseModeMark(bogus), { text: bogus, mode: null });
});
