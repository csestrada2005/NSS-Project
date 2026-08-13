import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCreditsFromTokens,
  tryAtomicDeduct,
  CREDIT_PRICING,
} from './credits.js';

// ---------------------------------------------------------------------------
// computeCreditsFromTokens — the pricing UNIT (unchanged from the old client).
// ---------------------------------------------------------------------------
test('computeCreditsFromTokens: zero tokens costs zero credits', () => {
  const { creditsToDeduct, totalCostUsd } = computeCreditsFromTokens(0, 0);
  assert.equal(creditsToDeduct, 0);
  assert.equal(totalCostUsd, 0);
});

test('computeCreditsFromTokens: rounds UP to the nearest credit', () => {
  // 1000 in + 1000 out = (0.001*3 + 0.001*15) = 0.018 USD * 300 = 5.4 → ceil 6
  const { creditsToDeduct } = computeCreditsFromTokens(1000, 1000);
  assert.equal(creditsToDeduct, 6);
});

test('computeCreditsFromTokens: matches the $3/$15 per-million, 300/USD formula', () => {
  const tokensInput = 1_000_000;
  const tokensOutput = 1_000_000;
  const { creditsToDeduct, totalCostUsd } = computeCreditsFromTokens(tokensInput, tokensOutput);
  const expectedUsd =
    CREDIT_PRICING.inputUsdPerMillion + CREDIT_PRICING.outputUsdPerMillion; // 18
  assert.equal(totalCostUsd, expectedUsd);
  assert.equal(creditsToDeduct, Math.ceil(expectedUsd * CREDIT_PRICING.usdToCredits)); // 5400
});

test('computeCreditsFromTokens: ignores negative / NaN token counts', () => {
  assert.equal(computeCreditsFromTokens(-5, -5).creditsToDeduct, 0);
  assert.equal(computeCreditsFromTokens(NaN, undefined).creditsToDeduct, 0);
});

// ---------------------------------------------------------------------------
// tryAtomicDeduct — faithful model of the SQL deduct_credits guard.
// ---------------------------------------------------------------------------
test('deduct_credits: sufficient balance succeeds and debits exactly', () => {
  const wallet = { balance_credits: 100 };
  const res = tryAtomicDeduct(wallet, 30);
  assert.equal(res.success, true);
  assert.equal(res.newBalance, 70);
  assert.equal(wallet.balance_credits, 70);
});

test('deduct_credits: exact balance succeeds and lands on zero', () => {
  const wallet = { balance_credits: 40 };
  const res = tryAtomicDeduct(wallet, 40);
  assert.equal(res.success, true);
  assert.equal(res.newBalance, 0);
});

test('deduct_credits: insufficient balance fails and leaves balance untouched', () => {
  const wallet = { balance_credits: 10 };
  const res = tryAtomicDeduct(wallet, 25);
  assert.equal(res.success, false);
  assert.equal(res.newBalance, 10);
  assert.equal(wallet.balance_credits, 10, 'balance must not go negative');
});

test('deduct_credits: concurrent deductions never overdraw the wallet', () => {
  // Start with 100 credits. Fire five 30-credit deductions "concurrently".
  // The WHERE balance >= amount guard means each one re-checks the live
  // balance, so at most three (90) can succeed; the sum can never exceed 100.
  const wallet = { balance_credits: 100 };
  const amounts = [30, 30, 30, 30, 30];

  const results = amounts.map(a => tryAtomicDeduct(wallet, a));
  const succeeded = results.filter(r => r.success);
  const totalDebited = succeeded.length * 30;

  assert.equal(succeeded.length, 3);
  assert.equal(totalDebited, 90);
  assert.equal(wallet.balance_credits, 10);
  assert.ok(wallet.balance_credits >= 0, 'balance never goes negative under races');
});

test('deduct_credits: rejects a negative amount (guards against sign bugs)', () => {
  assert.throws(() => tryAtomicDeduct({ balance_credits: 100 }, -5));
});

// ---------------------------------------------------------------------------
// CAMBIO 2 — drenar-a-cero (partial charge). With allowPartial, a charge that
// exceeds the balance takes everything that is left (leaving 0) instead of
// bouncing, and reports the drained amount so the server can record a
// transaction for -balance.
// ---------------------------------------------------------------------------
test('deduct_credits: partial drain charges the whole balance (30 of 81 → 0, txn -30)', () => {
  const wallet = { balance_credits: 30 };
  const res = tryAtomicDeduct(wallet, 81, true);
  assert.equal(res.success, true);
  assert.equal(res.newBalance, 0);
  assert.equal(res.partial, true);
  assert.equal(res.drained, 30, 'drained equals the pre-charge balance → transaction amount_credits = -30');
  assert.equal(wallet.balance_credits, 0, 'wallet is drained to exactly zero');
});

test('deduct_credits: partial drain is opt-in — without the flag an overcharge still bounces', () => {
  const wallet = { balance_credits: 30 };
  const res = tryAtomicDeduct(wallet, 81);
  assert.equal(res.success, false);
  assert.equal(res.newBalance, 30);
  assert.equal(res.partial, undefined);
  assert.equal(wallet.balance_credits, 30, 'balance untouched when partial is not allowed');
});

test('deduct_credits: partial drain on a zero balance still fails (nothing to drain)', () => {
  const wallet = { balance_credits: 0 };
  const res = tryAtomicDeduct(wallet, 81, true);
  assert.equal(res.success, false);
  assert.equal(res.newBalance, 0);
  assert.equal(res.partial, undefined);
});

test('deduct_credits: an exact/affordable charge ignores the partial flag (no drain path)', () => {
  const wallet = { balance_credits: 81 };
  const res = tryAtomicDeduct(wallet, 30, true);
  assert.equal(res.success, true);
  assert.equal(res.newBalance, 51);
  assert.equal(res.partial, undefined, 'full charge is a normal success, not a partial drain');
});
