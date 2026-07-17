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
  p_payer_leaves_jail boolean DEFAULT false,
  p_pending_debt jsonb DEFAULT null
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claimed    integer;
  v_payer_cash integer;
  v_credited   integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
  END IF;

  UPDATE monopoly_boards SET
    phase               = p_phase,
    pending_space       = null,
    pending_debt        = p_pending_debt,
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

REVOKE EXECUTE ON FUNCTION monopoly_settle_payment(text, timestamptz, uuid, uuid, integer, text, integer, integer, text, jsonb, timestamptz, boolean, jsonb) FROM PUBLIC, anon, authenticated;
