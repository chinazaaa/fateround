-- Codewords guess race fix (F4). Supersedes the definition in 0087.
-- After taking the row lock the function now re-validates, against the locked row, that
-- the game is not over, it is still the caller's team's turn, a clue exists and
-- guesses_remaining > 0. Previously 4 concurrent guesses on a clue of 2 (3 guesses)
-- revealed a 4th card, and a guess landing after the turn flipped saw guesses_remaining
-- NULL (NULL-1>0 is NULL), fell into the end-turn branch and wiped the other team's clue.
-- Errors: GAME_OVER / NOT_YOUR_TURN / NO_CLUE / NO_GUESSES_LEFT (mapped to 400 by the route).
-- Signature unchanged, so CREATE OR REPLACE keeps the ACL set by 20260803180000. The
-- pinned search_path from that migration lives in proconfig, which OR REPLACE resets, so
-- it is re-declared here via SET.
CREATE OR REPLACE FUNCTION codewords_process_guess(
  p_board_id uuid,
  p_cell_index integer,
  p_player_team text
) RETURNS SETOF codewords_boards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_board        codewords_boards;
  v_cell_type    text;
  v_revealed     integer[];
  v_other_team   text;
  v_winner       text;
  v_remaining    integer;
  v_red_total    integer;
  v_blue_total   integer;
  v_red_rev      integer;
  v_blue_rev     integer;
  v_deadline     timestamptz;
  v_result       codewords_boards;
BEGIN
  -- Lock the row — any concurrent call blocks here until we commit
  SELECT * INTO v_board FROM codewords_boards WHERE id = p_board_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Board not found';
  END IF;

  -- Re-check turn state now that we hold the lock. The route's pre-read is stale by the
  -- time concurrent guesses get here: the turn may have flipped, the clue been wiped, or
  -- the allowance already spent by a guess that committed first.
  IF v_board.winner IS NOT NULL THEN
    RAISE EXCEPTION 'GAME_OVER';
  END IF;
  IF v_board.current_turn IS DISTINCT FROM p_player_team THEN
    RAISE EXCEPTION 'NOT_YOUR_TURN';
  END IF;
  IF v_board.current_clue_word IS NULL THEN
    RAISE EXCEPTION 'NO_CLUE';
  END IF;
  IF v_board.guesses_remaining IS NULL OR v_board.guesses_remaining <= 0 THEN
    RAISE EXCEPTION 'NO_GUESSES_LEFT';
  END IF;

  -- Guard: already revealed (could happen if two people tap same card)
  IF p_cell_index = ANY(v_board.revealed_indices) THEN
    RAISE EXCEPTION 'ALREADY_REVEALED';
  END IF;

  -- key is text[] — Postgres arrays are 1-indexed; JS sends 0-based index
  v_cell_type  := v_board.key[p_cell_index + 1];
  v_other_team := CASE WHEN p_player_team = 'red' THEN 'blue' ELSE 'red' END;
  v_revealed   := array_append(v_board.revealed_indices, p_cell_index);

  -- ── Assassin ───────────────────────────────────────────────────────────
  IF v_cell_type = 'assassin' THEN
    UPDATE codewords_boards SET
      revealed_indices = v_revealed,
      winner           = v_other_team,
      assassin_team    = p_player_team,
      guesses_remaining = null,
      current_clue_word = null,
      current_clue_number = null,
      turn_phase       = 'clue',
      turn_deadline_at = null
    WHERE id = p_board_id
    RETURNING * INTO v_result;
    RETURN NEXT v_result; RETURN;
  END IF;

  -- ── Check for win ───────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE k.cell = 'red'),
    COUNT(*) FILTER (WHERE k.cell = 'blue')
  INTO v_red_total, v_blue_total
  FROM unnest(v_board.key) AS k(cell);

  SELECT
    COUNT(*) FILTER (WHERE v_board.key[r.idx + 1] = 'red'),
    COUNT(*) FILTER (WHERE v_board.key[r.idx + 1] = 'blue')
  INTO v_red_rev, v_blue_rev
  FROM unnest(v_revealed) AS r(idx);

  IF    v_red_rev  >= v_red_total  THEN v_winner := 'red';
  ELSIF v_blue_rev >= v_blue_total THEN v_winner := 'blue';
  END IF;

  IF v_winner IS NOT NULL THEN
    UPDATE codewords_boards SET
      revealed_indices  = v_revealed,
      winner            = v_winner,
      guesses_remaining = null,
      current_clue_word = null,
      current_clue_number = null,
      turn_phase        = 'clue',
      turn_deadline_at  = null
    WHERE id = p_board_id
    RETURNING * INTO v_result;
    RETURN NEXT v_result; RETURN;
  END IF;

  -- ── Correct team cell ───────────────────────────────────────────────────
  IF v_cell_type = p_player_team THEN
    v_remaining := v_board.guesses_remaining - 1;

    IF v_remaining > 0 THEN
      UPDATE codewords_boards SET
        revealed_indices  = v_revealed,
        guesses_remaining = v_remaining
      WHERE id = p_board_id
      RETURNING * INTO v_result;
      RETURN NEXT v_result; RETURN;
    END IF;
    -- else fall through to end-turn logic below
  END IF;

  -- ── End turn (wrong cell or used all guesses) ───────────────────────────
  v_deadline := CASE
    WHEN v_board.spymaster_timer_seconds > 0
    THEN now() + (v_board.spymaster_timer_seconds || ' seconds')::interval
    ELSE null
  END;

  UPDATE codewords_boards SET
    revealed_indices    = v_revealed,
    current_turn        = v_other_team,
    current_clue_word   = null,
    current_clue_number = null,
    guesses_remaining   = null,
    turn_phase          = 'clue',
    turn_deadline_at    = v_deadline
  WHERE id = p_board_id
  RETURNING * INTO v_result;
  RETURN NEXT v_result; RETURN;
END;
$$;
