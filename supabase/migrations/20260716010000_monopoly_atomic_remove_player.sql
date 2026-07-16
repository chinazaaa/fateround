-- Atomic board claim + player removal and dividend payout for Monopoly.
--
-- Orchestrates three operations in one transaction:
-- 1. Claims the board using optimistic concurrency (via monopoly_claim_and_apply)
-- 2. Distributes an estate dividend to all remaining active players
-- 3. Deletes the departing player
--
-- This guarantees that the dividend is not paid if the board claim fails,
-- and that a retry will not pay the dividend again if the player is already deleted.

CREATE OR REPLACE FUNCTION monopoly_remove_player(
  p_game_id text,
  p_expected_updated_at timestamptz,
  p_board_patch jsonb,
  p_player_id uuid,
  p_dividend integer DEFAULT 0
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Claim and apply the board changes using the generic patcher.
  -- A failure here means another writer interleaved; return false to signal
  -- the caller to abort or retry.
  IF NOT monopoly_claim_and_apply(p_game_id, p_expected_updated_at, p_board_patch, '[]'::jsonb) THEN
    RETURN false;
  END IF;

  -- 2. Concurrently credit all other active players with the dividend.
  IF coalesce(p_dividend, 0) > 0 THEN
    UPDATE monopoly_player_state
    SET cash = cash + p_dividend
    WHERE game_id = p_game_id
      AND player_id != p_player_id
      AND bankrupt = false;
  END IF;

  -- 3. Delete the player (this cascades to monopoly_player_state and other dependent rows).
  -- If this player was already deleted, it's a no-op, but the board claim would
  -- have failed anyway if this was a concurrent retry.
  DELETE FROM players
  WHERE game_id = p_game_id AND id = p_player_id;

  RETURN true;
END;
$$;

-- Revoke public execution to ensure only the server (service_role) can invoke this.
REVOKE EXECUTE ON FUNCTION monopoly_remove_player(text, timestamptz, jsonb, uuid, integer) FROM PUBLIC, anon, authenticated;
