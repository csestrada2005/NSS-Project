import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressHeadline } from '../src/utils/progressHeadline.js';

// 2026-10-01, Samuel: "Cambia el título "Choose your edge" por "Be brave, be
// bold"" mostraba "Trabajando en tu pedido"; debe decir qué está haciendo.
test('el verbo del pedido pasa a gerundio y se conserva el resto', () => {
  assert.equal(
    progressHeadline('Cambia el título "Choose your edge" por "Be brave, be bold"'),
    'Cambiando el título "Choose your edge" por "Be brave, be bold"…',
  );
  assert.equal(progressHeadline('agrega una sección de preguntas frecuentes'), 'Agregando una sección de preguntas frecuentes…');
  assert.equal(progressHeadline('Por favor, haz más grande el botón del hero.'), 'Haciendo más grande el botón del hero…');
  assert.equal(progressHeadline('Cámbialo a naranja'), 'Cambiando a naranja…');
  assert.equal(progressHeadline('Change the footer background to blue'), 'Changing the footer background to blue…');
});

test('un pedido largo se corta con puntos suspensivos', () => {
  const line = progressHeadline(`Agrega ${'una sección muy detallada '.repeat(10)}`);
  assert.ok(line.length <= 72);
  assert.ok(line.endsWith('…'));
});

test('preguntas o pedidos sin verbo conocido: el texto genérico de siempre', () => {
  assert.equal(progressHeadline('¿qué secciones tiene mi página?'), null);
  assert.equal(progressHeadline('el footer está muy grande'), null);
  assert.equal(progressHeadline(''), null);
});
