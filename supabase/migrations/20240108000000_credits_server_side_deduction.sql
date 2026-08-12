-- ---------------------------------------------------------------------------
-- CIRUGÍA: créditos server-side — el server cobra, el cliente solo mira.
--
-- The RLS sanitization removed the client's write access to
-- forge_credit_wallets / forge_credit_transactions (a client that charges
-- itself is a client that can choose not to). Deduction now runs on the server
-- with the service role. This migration provides the atomic primitive the
-- server calls to charge a wallet: it can never overdraw and it records the
-- spend transaction in the same round-trip.
--
-- Idempotent: safe to re-run. The credit tables already exist in the project
-- (created out-of-band before migrations tracked them), so we only ALTER/CREATE
-- the pieces this surgery adds — never the tables themselves.
-- ---------------------------------------------------------------------------

-- 1. Record which intent produced a spend (task requires {user_id, amount,
--    intent_type, project_id} on each spend row). Nullable so purchase /
--    admin_usage rows and historical rows are unaffected.
ALTER TABLE forge_credit_transactions
  ADD COLUMN IF NOT EXISTS intent_type text;

-- 2. Atomic deduction. The UPDATE ... WHERE balance_credits >= p_amount guard is
--    what makes this safe under concurrency: the row is locked for the update,
--    each racing caller re-reads the live balance, and the sum of successful
--    deductions can never exceed the starting balance. On insufficient funds the
--    UPDATE matches no row (NOT FOUND) and we return success=false WITHOUT
--    inserting a transaction, so the server can answer 402 cleanly.
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id      uuid,
  p_amount       integer,
  p_intent_type  text    DEFAULT NULL,
  p_project_id   uuid    DEFAULT NULL,
  p_tokens_input integer DEFAULT 0,
  p_tokens_output integer DEFAULT 0,
  p_cost_usd     numeric DEFAULT NULL
)
RETURNS TABLE (success boolean, new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance integer;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'deduct_credits: p_amount must be a non-negative integer, got %', p_amount;
  END IF;

  -- A zero charge is a no-op success (fast lane / cancelled runs charge 0).
  IF p_amount = 0 THEN
    RETURN QUERY
      SELECT true, COALESCE(
        (SELECT balance_credits FROM forge_credit_wallets WHERE user_id = p_user_id),
        0);
    RETURN;
  END IF;

  UPDATE forge_credit_wallets
     SET balance_credits = balance_credits - p_amount
   WHERE user_id = p_user_id
     AND balance_credits >= p_amount
  RETURNING balance_credits INTO v_new_balance;

  IF NOT FOUND THEN
    -- Insufficient funds (or no wallet row): report the current balance, if any.
    RETURN QUERY
      SELECT false, COALESCE(
        (SELECT balance_credits FROM forge_credit_wallets WHERE user_id = p_user_id),
        0);
    RETURN;
  END IF;

  INSERT INTO forge_credit_transactions (
    user_id, project_id, type, intent_type,
    amount_credits, tokens_input, tokens_output, cost_usd
  ) VALUES (
    p_user_id, p_project_id, 'spend', p_intent_type,
    -p_amount, p_tokens_input, p_tokens_output, p_cost_usd
  );

  RETURN QUERY SELECT true, v_new_balance;
END;
$$;

-- 3. Defense in depth: only the service role (server) may execute this. Even
--    though SECURITY DEFINER + service-role access already bypasses RLS, we
--    explicitly deny the client roles so a browser can never call it directly.
REVOKE ALL ON FUNCTION deduct_credits(uuid, integer, text, uuid, integer, integer, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION deduct_credits(uuid, integer, text, uuid, integer, integer, numeric) FROM anon;
REVOKE ALL ON FUNCTION deduct_credits(uuid, integer, text, uuid, integer, integer, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION deduct_credits(uuid, integer, text, uuid, integer, integer, numeric) TO service_role;
