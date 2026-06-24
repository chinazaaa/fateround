-- Atomic guess handler for Codewords.
-- Uses FOR UPDATE to lock the board row so concurrent guesses from two operatives
-- cannot both read guesses_remaining=2 and both write guesses_remaining=1.
-- Also ensures revealed_indices is appended atomically (no lost updates).
CREATE OR REPLACE FUNCTION codewords_process_guess(
  p_board_id uuid,
  p_cell_index integer,
  p_player_team text
) RETURNS SETOF codewords_boards
LANGUAGE plpgsql
SECURITY DEFINER
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
