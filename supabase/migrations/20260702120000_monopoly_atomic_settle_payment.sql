-- Atomic rent/debt settlement for Monopoly.
--
-- The JS handlers used to claim the board via CAS and then issue two separate
-- absolute cash UPDATEs (payer, then creditor) computed from reads taken
-- before the claim. That left a window where the turn had already advanced
-- but one or both cash writes were lost — a failed write, or any concurrent
-- absolute cash write (mortgage/build/roll handlers read-modify-write the
-- same column), silently dropped the transfer. Players saw rent "not paid"
-- or "paid but never received".
--
-- This function performs the board claim and both cash movements in ONE
-- transaction, using delta-based updates so the transfer can never be lost
-- or double-applied. If the payer can no longer afford the amount, the whole
-- transaction (including the claim) rolls back via INSUFFICIENT_FUNDS so the
-- caller can enter the raise-funds phase instead.
CREATE OR REPLACE FUNCTION monopoly_settle_payment(
  p_game_id text,
  p_expected_updated_at timestamptz,
  p_payer_id uuid,
  p_creditor_id uuid,          -- null = pay the bank
  p_amount integer,
  p_phase text,
  p_current_turn_index integer,
  p_consecutive_doubles integer,
  p_status_message text,
  p_last_rent_event jsonb,     -- pass the existing value when unchanged
  p_turn_deadline_at timestamptz,
  p_payer_leaves_jail boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed    integer;
  v_payer_cash integer;
  v_credited   integer;
BEGIN
  -- Claim the board first — the same optimistic-concurrency token the JS
  -- handlers race on. Zero rows means another trigger already settled this
  -- payment; return false without touching any cash.
  UPDATE monopoly_boards SET
    phase               = p_phase,
    pending_space       = null,
    pending_debt        = null,
    current_turn_index  = p_current_turn_index,
    consecutive_doubles = p_consecutive_doubles,
    status_message      = p_status_message,
    last_rent_event     = p_last_rent_event,
    turn_deadline_at    = p_turn_deadline_at,
    updated_at          = now()
  WHERE game_id = p_game_id AND updated_at = p_expected_updated_at;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN false;
  END IF;

  SELECT cash INTO v_payer_cash
  FROM monopoly_player_state
  WHERE game_id = p_game_id AND player_id = p_payer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_NOT_FOUND';
  END IF;
  IF v_payer_cash < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_FUNDS';
  END IF;

  UPDATE monopoly_player_state SET
    cash       = cash - p_amount,
    in_jail    = CASE WHEN p_payer_leaves_jail THEN false ELSE in_jail END,
    jail_turns = CASE WHEN p_payer_leaves_jail THEN 0 ELSE jail_turns END
  WHERE game_id = p_game_id AND player_id = p_payer_id;

  IF p_creditor_id IS NOT NULL THEN
    UPDATE monopoly_player_state SET cash = cash + p_amount
    WHERE game_id = p_game_id AND player_id = p_creditor_id;
    GET DIAGNOSTICS v_credited = ROW_COUNT;
    IF v_credited = 0 THEN
      RAISE EXCEPTION 'CREDITOR_NOT_FOUND';
    END IF;
  END IF;

  RETURN true;
END;
$$;
