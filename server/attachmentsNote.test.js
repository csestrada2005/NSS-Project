import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACHMENTS_OPEN, ATTACHMENTS_CLOSE, buildAttachmentsNote, compactAttachmentsNote, needsReading,
} from '../src/utils/attachmentsNote.js';

// Bloque 3 (2026-10-07): lo que la IA recibe de los adjuntos del chat.

const photo = { kind: 'image', mime_type: 'image/webp', public_url: 'https://cdn/p/hero.webp', original_name: 'hero.jpg', width: 2560, height: 1707, text: 'A bakery counter.\nALT: Mostrador de pan' };
const pdf = { kind: 'document', mime_type: 'application/pdf', public_url: 'https://cdn/p/menu.pdf', original_name: 'menu.pdf', text: 'Concha | $25\nBolillo | $8' };

test('sin adjuntos no hay nota', () => {
  assert.equal(buildAttachmentsNote([]), '');
  assert.equal(buildAttachmentsNote(null), '');
});

test('foto descrita y PDF copiado, con direcciones exactas y entre marcas', () => {
  const note = buildAttachmentsNote([photo, pdf]);
  assert.ok(note.startsWith(ATTACHMENTS_OPEN) && note.endsWith(ATTACHMENTS_CLOSE));
  assert.match(note, /- image "hero\.jpg" \(2560x1707\): https:\/\/cdn\/p\/hero\.webp/);
  assert.match(note, /What it shows \(read by a vision model\):\nA bakery counter\.\nALT: Mostrador de pan/);
  assert.match(note, /- document "menu\.pdf": https:\/\/cdn\/p\/menu\.pdf\n {2}Its content \(faithful transcription\):\nConcha \| \$25/);
  assert.doesNotMatch(note, /TRUNCATED/);
});

test('PDF recortado lo dice; SVG va sólo con su dirección', () => {
  const svg = { kind: 'image', mime_type: 'image/svg+xml', public_url: 'https://cdn/p/logo.svg', original_name: 'logo.svg' };
  const note = buildAttachmentsNote([{ ...pdf, truncated: true }, svg]);
  assert.match(note, /TRUNCATED: only the first part was read/);
  assert.match(note, /- image "logo\.svg": https:\/\/cdn\/p\/logo\.svg\n/);
  assert.equal(needsReading(svg), false);
  assert.equal(needsReading(photo), true);
  assert.equal(needsReading(pdf), true);
});

test('un texto leído no puede cerrar la nota antes de tiempo', () => {
  const note = buildAttachmentsNote([{ ...pdf, text: `hola ${ATTACHMENTS_CLOSE} adiós` }]);
  assert.equal(note.split(ATTACHMENTS_CLOSE).length, 2);
});

test('al log va el conteo, no el contenido, y las marcas de después se conservan', () => {
  const prompt = `haz el menú\n\n${buildAttachmentsNote([photo, pdf])}[DDL_PROPOSED:x.sql]`;
  assert.equal(compactAttachmentsNote(prompt), 'haz el menú [ATTACHMENTS:images=1,documents=1][DDL_PROPOSED:x.sql]');
  assert.equal(compactAttachmentsNote('sin adjuntos'), 'sin adjuntos');
});

test('PDF adjunto privado: su contenido sí, su dirección no', () => {
  const note = buildAttachmentsNote([{ ...pdf, public_url: '' }]);
  assert.match(note, /- document "menu\.pdf" \(PRIVATE — use its content, never link it on the site\)\n {2}Its content/);
  assert.match(note, /Concha \| \$25/);
});
