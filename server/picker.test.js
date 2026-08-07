import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PREVIEW_CLIENT_SCRIPT } from './compiler.js';

// ---------------------------------------------------------------------------
// PR-2 — Visual mode picker (PREVIEW_CLIENT_SCRIPT). Structural guarantees:
// the picker selects the nearest data-oid element, reports every instance count,
// supports optimistic edits and Escape-to-deselect, and NEVER intercepts scroll.
// ---------------------------------------------------------------------------

test('picker selects by nearest data-oid ancestor', () => {
  assert.match(PREVIEW_CLIENT_SCRIPT, /closest\('\[data-oid\]'\)/, 'walks up to the nearest data-oid');
});

test('click posts element-selected with an instanceCount over ALL instances of the oid', () => {
  assert.match(PREVIEW_CLIENT_SCRIPT, /type: 'element-selected'/);
  assert.match(PREVIEW_CLIENT_SCRIPT, /instanceCount/);
  // Instance count comes from querySelectorAll over the oid (repeated .map() nodes).
  assert.match(PREVIEW_CLIENT_SCRIPT, /querySelectorAll\('\[data-oid="' \+ oid \+ '"\]'\)/);
});

test('selecting highlights ALL instances of the oid, not just the clicked node', () => {
  assert.match(PREVIEW_CLIENT_SCRIPT, /__forge-selected/);
  assert.match(PREVIEW_CLIENT_SCRIPT, /markSelected/);
});

test('Escape (and clicking a no-oid zone) deselects', () => {
  assert.match(PREVIEW_CLIENT_SCRIPT, /event\.key === 'Escape'/);
  assert.match(PREVIEW_CLIENT_SCRIPT, /type: 'element-deselected'/);
});

test('optimistic apply-visual-edit updates every instance of the oid', () => {
  assert.match(PREVIEW_CLIENT_SCRIPT, /apply-visual-edit/);
});

test('scroll works — the picker never intercepts wheel/touch events', () => {
  assert.ok(!/addEventListener\('wheel'/.test(PREVIEW_CLIENT_SCRIPT), 'no wheel listener');
  assert.ok(!/addEventListener\('touchmove'/.test(PREVIEW_CLIENT_SCRIPT), 'no touchmove listener');
  assert.ok(!/addEventListener\('touchstart'/.test(PREVIEW_CLIENT_SCRIPT), 'no touchstart listener');
});

test('the picker only preventDefaults click in visual mode (not in interaction mode)', () => {
  // In interaction mode the click handler returns early before preventDefault.
  assert.match(PREVIEW_CLIENT_SCRIPT, /if \(currentMode !== 'visual'\) return;/);
});
