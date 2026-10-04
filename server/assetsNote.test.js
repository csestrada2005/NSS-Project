import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssetsNote } from '../src/utils/assetsNote.js';

test('la IA recibe los archivos subidos con su dirección exacta', () => {
  const note = buildAssetsNote([
    { kind: 'image', public_url: 'https://x.supabase.co/storage/v1/object/public/project-assets/p/ab-logo.webp', original_name: 'logo.png', width: 512, height: 512 },
    { kind: 'document', public_url: 'https://x.supabase.co/storage/v1/object/public/project-assets/p/cd-menu.pdf', original_name: 'menu.pdf' },
  ]);
  assert.match(note, /- image "logo\.png" \(512x512\): https:\/\/x\.supabase\.co\/.*ab-logo\.webp/);
  assert.match(note, /- document "menu\.pdf": https:/);
  assert.match(note, /EXACT URLs/);
  assert.equal(buildAssetsNote([]), '');
  assert.equal(buildAssetsNote(null), '');
});
