import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIntentAccumulator } from './intentAccumulator.js';

// ---------------------------------------------------------------------------
// accumulate — correlation across the many chat-forge calls of one intent.
// ---------------------------------------------------------------------------
test('accumulate: folds tokens from every request of one intent', () => {
  const acc = createIntentAccumulator();
  acc.accumulate('i1', { userId: 'u1', tokensInput: 100, tokensOutput: 10 }, 0);
  acc.accumulate('i1', { userId: 'u1', tokensInput: 200, tokensOutput: 20 }, 1);
  const rec = acc.get('i1');
  assert.equal(rec.tokensInput, 300);
  assert.equal(rec.tokensOutput, 30);
  assert.equal(rec.requests, 2);
  assert.equal(acc.size(), 1);
});

test('accumulate: first request owns userId / projectId / intentType', () => {
  const acc = createIntentAccumulator();
  acc.accumulate('i1', { userId: 'u1', projectId: 'p1', intentType: 'style_change', tokensInput: 5 }, 0);
  // later requests without metadata must not clear the recorded owner/context
  acc.accumulate('i1', { userId: 'u1', tokensOutput: 5 }, 1);
  const rec = acc.get('i1');
  assert.equal(rec.userId, 'u1');
  assert.equal(rec.projectId, 'p1');
  assert.equal(rec.intentType, 'style_change');
});

test('accumulate: backfills projectId / intentType when the first request omitted them', () => {
  const acc = createIntentAccumulator();
  acc.accumulate('i1', { userId: 'u1', tokensInput: 5 }, 0);
  acc.accumulate('i1', { userId: 'u1', projectId: 'p9', intentType: 'add_feature', tokensOutput: 5 }, 1);
  const rec = acc.get('i1');
  assert.equal(rec.projectId, 'p9');
  assert.equal(rec.intentType, 'add_feature');
});

test('accumulate: a different userId cannot hijack or reassign an intent', () => {
  const acc = createIntentAccumulator();
  acc.accumulate('i1', { userId: 'owner', tokensInput: 100, tokensOutput: 100 }, 0);
  const spoofed = acc.accumulate('i1', { userId: 'attacker', tokensInput: 999, tokensOutput: 999 }, 1);
  assert.equal(spoofed, null, 'spoofed accumulate is rejected');
  const rec = acc.get('i1');
  assert.equal(rec.userId, 'owner');
  assert.equal(rec.tokensInput, 100, 'attacker tokens are not folded in');
  assert.equal(rec.tokensOutput, 100);
});

test('accumulate: ignores negative / NaN token counts', () => {
  const acc = createIntentAccumulator();
  acc.accumulate('i1', { userId: 'u1', tokensInput: -5, tokensOutput: NaN }, 0);
  const rec = acc.get('i1');
  assert.equal(rec.tokensInput, 0);
  assert.equal(rec.tokensOutput, 0);
});

test('accumulate: falsy intentId is a no-op', () => {
  const acc = createIntentAccumulator();
  assert.equal(acc.accumulate('', { userId: 'u1', tokensInput: 5 }, 0), null);
  assert.equal(acc.accumulate(undefined, { userId: 'u1', tokensInput: 5 }, 0), null);
  assert.equal(acc.size(), 0);
});

// ---------------------------------------------------------------------------
// close — explicit close is idempotent (double close never charges twice).
// ---------------------------------------------------------------------------
test('close: returns the record once, then null (double close is safe)', () => {
  const acc = createIntentAccumulator();
  acc.accumulate('i1', { userId: 'u1', tokensInput: 100, tokensOutput: 50 }, 0);

  const first = acc.close('i1');
  assert.ok(first);
  assert.equal(first.tokensInput, 100);
  assert.equal(first.tokensOutput, 50);
  assert.equal(first.closeReason, 'explicit');

  const second = acc.close('i1');
  assert.equal(second, null, 'second close returns nothing to charge');
  assert.equal(acc.size(), 0);
});

test('close: unknown intentId returns null', () => {
  const acc = createIntentAccumulator();
  assert.equal(acc.close('nope'), null);
});

// ---------------------------------------------------------------------------
// collectExpired — idle sweep (120s) and TTL backstop (15 min).
// ---------------------------------------------------------------------------
test('collectExpired: an idle intent past idleCloseMs is closed and charged', () => {
  const acc = createIntentAccumulator({ idleCloseMs: 120_000, ttlMs: 900_000 });
  acc.accumulate('i1', { userId: 'u1', tokensInput: 100 }, 1_000);

  // 100s later — still active, not swept.
  assert.equal(acc.collectExpired(101_000).length, 0);
  assert.equal(acc.size(), 1);

  // 120s after lastSeenAt — swept as idle.
  const due = acc.collectExpired(121_000);
  assert.equal(due.length, 1);
  assert.equal(due[0].intentId, 'i1');
  assert.equal(due[0].closeReason, 'idle');
  assert.equal(acc.size(), 0);
});

test('collectExpired: a fresh request resets the idle clock', () => {
  const acc = createIntentAccumulator({ idleCloseMs: 120_000, ttlMs: 900_000 });
  acc.accumulate('i1', { userId: 'u1', tokensInput: 100 }, 0);
  acc.accumulate('i1', { userId: 'u1', tokensInput: 100 }, 119_000); // keep-alive
  // 121s after START but only 2s after the last request → still active.
  assert.equal(acc.collectExpired(121_000).length, 0);
  assert.equal(acc.size(), 1);
});

test('collectExpired: TTL backstop closes a long-lived but still-active intent', () => {
  const acc = createIntentAccumulator({ idleCloseMs: 120_000, ttlMs: 900_000 });
  // Keep it alive with a request every 100s so the idle sweep never fires...
  for (let t = 0; t <= 900_000; t += 100_000) {
    acc.accumulate('i1', { userId: 'u1', tokensInput: 1 }, t);
  }
  // ...at 900s past start the TTL backstop still forces the close.
  const due = acc.collectExpired(900_000);
  assert.equal(due.length, 1);
  assert.equal(due[0].closeReason, 'ttl');
  assert.equal(acc.size(), 0);
});

test('collectExpired: an explicit close before the sweep prevents a double charge', () => {
  const acc = createIntentAccumulator({ idleCloseMs: 120_000, ttlMs: 900_000 });
  acc.accumulate('i1', { userId: 'u1', tokensInput: 100 }, 0);
  const closed = acc.close('i1');
  assert.ok(closed);
  // The sweep now finds nothing — the record is already gone.
  assert.equal(acc.collectExpired(1_000_000).length, 0);
});
