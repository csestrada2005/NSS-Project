import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeAroundLine, withTypeErrorContext } from '../src/utils/typeErrorContext.js';
import { isTypeFixRequest } from '../src/utils/laneRouting.js';

// Caso real de Samuel (Vertigo, 2026-10-01): AdminUsersTable.tsx:366.
const table = Array.from({ length: 400 }, (_, i) => `// línea ${i + 1}`);
table[364] = '      <td className="whitespace-nowrap px-6 py-4">';
table[365] = '        <StatusBadge status={user.status} />';
table[366] = '      </td>';
const files = new Map([['src/components/sections/AdminUsersTable.tsx', table.join('\n')]]);

const PROMPT = [
  'Arregla estos errores de tipos de TypeScript para que el proyecto se pueda publicar, sin quitar ninguna funcionalidad:',
  "- src/components/sections/AdminUsersTable.tsx(366,9): TS2322 Type '\"active\" | \"inactive\" | \"pending\" | undefined' is not assignable to type 'AppUserStatus'.",
].join('\n');

test('el pedido lleva el código real de la línea con error, marcada', () => {
  const out = withTypeErrorContext(PROMPT, files);
  assert.match(out, /> 366 \|         <StatusBadge status=\{user\.status\} \/>/);
  assert.match(out, /  365 \|       <td className/);
  assert.match(out, /quote the exact line to change/);
  assert.equal(isTypeFixRequest(out), true, 'sigue reconociéndose como "Arreglar ahora"');
});

test('sin archivo, sin línea o con otro formato: el pedido queda igual', () => {
  assert.equal(withTypeErrorContext(PROMPT, new Map()), PROMPT);
  assert.equal(withTypeErrorContext('cambia el título', files), 'cambia el título');
  const fueraDeRango = PROMPT.replace('(366,9)', '(9999,1)');
  assert.equal(withTypeErrorContext(fueraDeRango, files), fueraDeRango);
});

test('codeAroundLine: bordes del archivo', () => {
  assert.equal(codeAroundLine('a\nb\nc', 1), '    > 1 | a\n      2 | b\n      3 | c');
  assert.equal(codeAroundLine('a', 0), '');
  assert.equal(codeAroundLine(undefined, 1), '');
});
