-- ---------------------------------------------------------------------------
-- CIRUGÍA: drenar-a-cero en el cierre del cobro (CAMBIO 2).
--
-- "Trabajo servido es trabajo cobrado": when an intent closes and the wallet no
-- longer holds the full charge but still holds SOMETHING, we take everything
-- that is left instead of letting the charge bounce. This adds a
-- `p_allow_partial boolean` parameter to deduct_credits:
--
--   * p_allow_partial = false (default) → today's behavior verbatim: charge only
--     when balance >= p_amount, otherwise success=false and no transaction.
--   * p_allow_partial = true and 0 < balance < p_amount → drain the balance to 0,
--     insert a spend transaction with amount_credits = -balance (the credits
--     actually taken) and cost_usd = p_cost_usd (the FULL real cost of the work),
--     and return (success=true, new_balance=0, partial=true).
--   * balance = 0 (or no wallet row) → unchanged: success=false, partial=false.
--
-- The server calls this at intent close with p_allow_partial = true (the sweep /
-- explicit-close path). The atomic full-charge guard is preserved for the common
-- case; the partial branch runs under FOR UPDATE so a concurrent charge cannot
-- double-drain the same balance.
--
-- The RETURNS TABLE gains a `partial` column, so this migration DROPs the old
-- 7-argument function and CREATEs the 8-argument one. Idempotent: safe to re-run.
-- Only the server (service_role) may execute it.
-- ---------------------------------------------------------------------------

-- Drop the previous signature (7 args, 2-column return). CREATE OR REPLACE
-- cannot change the return type or add a column, so the old function must go
-- first. Named so a re-run is a no-op when it is already gone.
DROP FUNCTION IF EXISTS deduct_credits(uuid, integer, text, uuid, integer, integer, numeric);

CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id       uuid,
  p_amount        integer,
  p_intent_type   text    DEFAULT NULL,
  p_project_id    uuid    DEFAULT NULL,
  p_tokens_input  integer DEFAULT 0,
  p_tokens_output integer DEFAULT 0,
  p_cost_usd      numeric DEFAULT NULL,
  p_allow_partial boolean DEFAULT false
)
RETURNS TABLE (success boolean, new_balance integer, partial boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
  v_drained     integer;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'deduct_credits: p_amount must be a non-negative integer, got %', p_amount;
  END IF;

  -- A zero charge is a no-op success (fast lane / cancelled runs charge 0).
  IF p_amount = 0 THEN
    RETURN QUERY
      SELECT true, COALESCE(
        (SELECT balance_credits FROM forge_credit_wallets WHERE user_id = p_user_id),
        0), false;
    RETURN;
  END IF;

  -- Full charge: the balance >= p_amount guard makes this atomic under
  -- concurrency (row-locked, each racing caller re-reads the live balance, the
  -- sum of successful deductions can never exceed the starting balance).
  UPDATE forge_credit_wallets
     SET balance_credits = balance_credits - p_amount
   WHERE user_id = p_user_id
     AND balance_credits >= p_amount
  RETURNING balance_credits INTO v_new_balance;

  IF FOUND THEN
    INSERT INTO forge_credit_transactions (
      user_id, project_id, type, description,
      amount_credits, tokens_input, tokens_output, cost_usd
    ) VALUES (
      p_user_id, p_project_id, 'deduction', p_intent_type,
      -p_amount, p_tokens_input, p_tokens_output, p_cost_usd
    );
    RETURN QUERY SELECT true, v_new_balance, false;
    RETURN;
  END IF;

  IF p_allow_partial THEN
    SELECT balance_credits INTO v_drained
      FROM forge_credit_wallets
     WHERE user_id = p_user_id
     FOR UPDATE;
    IF v_drained IS NOT NULL AND v_drained > 0 THEN
      -- Cap contra la carrera de top-up: jamás cobrar más que p_amount
      v_drained := LEAST(v_drained, p_amount);
      UPDATE forge_credit_wallets
         SET balance_credits = balance_credits - v_drained
       WHERE user_id = p_user_id;
      INSERT INTO forge_credit_transactions (
        user_id, project_id, type, description,
        amount_credits, tokens_input, tokens_output, cost_usd
      ) VALUES (
        p_user_id, p_project_id, 'deduction', p_intent_type,
        -v_drained, p_tokens_input, p_tokens_output, p_cost_usd
      );
      RETURN QUERY SELECT true,
        (SELECT balance_credits FROM forge_credit_wallets WHERE user_id = p_user_id),
        true;
      RETURN;
    END IF;
  END IF;

  -- Balance = 0 (or no wallet): unchanged — report the current balance, no txn.
  RETURN QUERY
    SELECT false, COALESCE(
      (SELECT balance_credits FROM forge_credit_wallets WHERE user_id = p_user_id),
      0), false;
END;
$$;

-- Defense in depth: only the service role (server) may execute this. Drop any
-- inherited grants on the new signature and grant service_role explicitly.
REVOKE ALL ON FUNCTION deduct_credits(uuid, integer, text, uuid, integer, integer, numeric, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION deduct_credits(uuid, integer, text, uuid, integer, integer, numeric, boolean) FROM anon;
REVOKE ALL ON FUNCTION deduct_credits(uuid, integer, text, uuid, integer, integer, numeric, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION deduct_credits(uuid, integer, text, uuid, integer, integer, numeric, boolean) TO service_role;
