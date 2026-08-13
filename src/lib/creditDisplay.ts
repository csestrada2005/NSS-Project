// ---------------------------------------------------------------------------
// CAMBIO 3 — friendly display scale for credits.
//
// The INTERNAL accounting unit (wallets, transactions, RPC, the cost formula)
// is unchanged. This module only scales the number SHOWN to the user, so a
// balance of 250 internal units reads as "2.5 créditos" instead of an
// intimidating "250".
//
// SINGLE SOURCE OF TRUTH: the CLIENT divides. Balance display is fully
// client-side (the credit chip reads the wallet directly via RLS, never through
// the server), so scaling on the server would not reach the chip anyway. Every
// user-facing surface — the chip, balance messages, the 402 — imports
// DISPLAY_DIVISOR / formatCredits from here so they never drift apart.
// ---------------------------------------------------------------------------

/** Internal credit units per one displayed "crédito". Internal math never uses this. */
export const DISPLAY_DIVISOR = 100;

/**
 * Format an internal credit balance as the friendly display value with one
 * decimal place ("2.5"). Non-finite input (e.g. an unlimited-wallet Infinity)
 * falls back to "0.0"; callers that need the ∞ badge branch before calling this.
 */
export function formatCredits(internal: number): string {
  if (!Number.isFinite(internal)) return '0.0';
  return (internal / DISPLAY_DIVISOR).toFixed(1);
}
