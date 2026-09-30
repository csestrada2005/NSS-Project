import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEditBlocks,
  describeFailures,
  parseEditBlocks,
  wantsFullRewrite,
} from '../src/utils/searchReplace.js';

const FILE = `export function ReviewsSection() {
  return (
    <section className="bg-white py-24">
      <h2 className="text-3xl">Reseñas</h2>
      <div className="grid gap-6">
        <div className="bg-white p-4">A</div>
      </div>
    </section>
  );
}
`;

const reply = (...blocks) =>
  blocks.map(([s, r]) => `<<<<<<< SEARCH\n${s}\n=======\n${r}\n>>>>>>> REPLACE`).join('\n\n');

test('cambio exacto: sólo cambia lo pedido', () => {
  const blocks = parseEditBlocks(reply(['    <section className="bg-white py-24">', '    <section className="bg-orange-500 py-24">']));
  assert.equal(blocks.length, 1);
  const { content, failures } = applyEditBlocks(FILE, blocks);
  assert.deepEqual(failures, []);
  assert.equal(content, FILE.replace('<section className="bg-white py-24">', '<section className="bg-orange-500 py-24">'));
});

test('varios bloques, y un REPLACE vacío borra', () => {
  const blocks = parseEditBlocks(
    'Aquí va:\n' + reply(['      <h2 className="text-3xl">Reseñas</h2>', '      <h2 className="text-4xl">Reseñas</h2>'], ['        <div className="bg-white p-4">A</div>', '']),
  );
  const { content } = applyEditBlocks(FILE, blocks);
  assert.match(content, /text-4xl/);
  assert.doesNotMatch(content, />A</);
});

test('tolera sangría distinta en un SEARCH de varias líneas', () => {
  const blocks = parseEditBlocks(reply([
    '<h2 className="text-3xl">Reseñas</h2>\n<div className="grid gap-6">',
    '      <h2 className="text-3xl text-orange-500">Reseñas</h2>\n      <div className="grid gap-6">',
  ]));
  const { content, failures } = applyEditBlocks(FILE, blocks);
  assert.deepEqual(failures, []);
  assert.match(content, /\n      <h2 className="text-3xl text-orange-500">Reseñas<\/h2>\n      <div className="grid gap-6">\n/);
});

test('todo o nada: un bloque ambiguo o inexistente no aplica ninguno y dice cuál', () => {
  const blocks = parseEditBlocks(
    reply(['className="bg-white', 'className="bg-black'], ['<h2 className="text-3xl">Reseñas</h2>', '<h2>R</h2>'], ['<footer>', '<footer class="x">']),
  );
  const { content, failures } = applyEditBlocks(FILE, blocks);
  assert.equal(content, null);
  assert.deepEqual(failures.map((f) => [f.index, f.reason]), [[0, 'ambiguous'], [2, 'not-found']]);
  const message = describeFailures(failures, blocks);
  assert.match(message, /Block 1: .*appears 2 times/);
  assert.match(message, /Block 3: .*does not appear/);
  assert.match(message, /Send ALL the blocks again/);
});

test('respuesta sin bloques → [] (el llamador lo cuenta como intento fallido)', () => {
  assert.deepEqual(parseEditBlocks('¿Qué sección quieres cambiar?'), []);
  assert.deepEqual(parseEditBlocks(''), []);
});

test('archivo completo sólo si el usuario lo pide', () => {
  for (const s of ['reescribe la sección de reseñas', 'Rehaz el hero desde cero', 'rewrite the footer', 'haz de nuevo toda la sección']) {
    assert.equal(wantsFullRewrite(s), true, s);
  }
  for (const s of ['cambia el fondo de reseñas a naranja', 'haz más grande el botón del hero', 'escribe un título nuevo']) {
    assert.equal(wantsFullRewrite(s), false, s);
  }
});
