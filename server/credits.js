// ---------------------------------------------------------------------------
// Server-side credit accounting (CIRUGÍA: créditos server-side).
//
// The pricing UNIT is unchanged from the old client-side CreditService — this
// module only moves the math to the server so it can be applied with the
// service role (which bypasses RLS by design). Do NOT redesign pricing here.
//
//   inputCost  = tokensInput  / 1_000_000 * $3.00
//   outputCost = tokensOutput / 1_000_000 * $15.00
//   credits    = ceil((inputCost + outputCost) * 300)   // 300 credits per USD
//
// Pure functions live here so they can be unit-tested with `node --test`
// without a live Postgres. The real atomic deduction runs in the SQL function
// `deduct_credits` (see the migration); `tryAtomicDeduct` below is a faithful
// in-memory model of that function's guard, used by the concurrency tests.
// ---------------------------------------------------------------------------

export const CREDIT_PRICING = {
  inputUsdPerMillion: 3.0,
  outputUsdPerMillion: 15.0,
  usdToCredits: 300,
};

/**
 * Compute how many credits a call costs from its token usage.
 * Returns both the integer credit charge (rounded UP, matching the old
 * client formula) and the raw USD cost for the transaction audit row.
 */
export function computeCreditsFromTokens(tokensInput = 0, tokensOutput = 0) {
  const tIn = Number.isFinite(tokensInput) && tokensInput > 0 ? tokensInput : 0;
  const tOut = Number.isFinite(tokensOutput) && tokensOutput > 0 ? tokensOutput : 0;
  const inputCost = (tIn / 1_000_000) * CREDIT_PRICING.inputUsdPerMillion;
  const outputCost = (tOut / 1_000_000) * CREDIT_PRICING.outputUsdPerMillion;
  const totalCostUsd = inputCost + outputCost;
  const creditsToDeduct = Math.ceil(totalCostUsd * CREDIT_PRICING.usdToCredits);
  return { creditsToDeduct, totalCostUsd };
}

/**
 * In-memory model of the SQL `deduct_credits` guard:
 *   UPDATE forge_credit_wallets
 *      SET balance_credits = balance_credits - amount
 *    WHERE user_id = ? AND balance_credits >= amount
 *   RETURNING balance_credits;
 *
 * The `WHERE balance_credits >= amount` predicate is what makes the deduction
 * atomic and safe under concurrency: two racing requests each re-read the row
 * under the row lock, so the sum of successful deductions can never exceed the
 * starting balance. `wallet` is mutated in place, mirroring the row update.
 *
 * @returns {{ success: boolean, newBalance: number }}
 */
export function tryAtomicDeduct(wallet, amount) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error('amount must be a non-negative integer');
  }
  const balance = wallet.balance_credits ?? 0;
  if (balance >= amount) {
    wallet.balance_credits = balance - amount;
    return { success: true, newBalance: wallet.balance_credits };
  }
  return { success: false, newBalance: balance };
}
