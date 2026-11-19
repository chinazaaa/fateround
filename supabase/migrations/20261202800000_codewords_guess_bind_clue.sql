-- Codewords guess: bind a guess to the clue the caller observed.
-- The route checks clue R1, but by the time the RPC takes the row lock both teams can have
-- taken another turn and the same team posted clue R2; the locked checks (up, clue exists,
-- guesses remain) all pass, so the guess spent R2's allowance while being recorded under R1.
-- clue_seq is bumped by a trigger each time a clue is posted (any change to the word or the number of
-- a non-NULL clue, which includes a second post replacing an existing clue), and the RPC
-- compares the caller's observed value under the lock (STALE_CLUE). p_clue_seq defaults to NULL
-- (skip the check) so a route deployed before this migration keeps working.
ALTER TABLE codewords_boards ADD COLUMN IF NOT EXISTS clue_seq integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION codewords_bump_clue_seq() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.current_clue_word IS NOT NULL
     AND (NEW.current_clue_word IS DISTINCT FROM OLD.current_clue_word
          OR NEW.current_clue_number IS DISTINCT FROM OLD.current_clue_number) THEN
    NEW.clue_seq := OLD.clue_seq + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS codewords_boards_bump_clue_seq ON codewords_boards;
CREATE TRIGGER codewords_boards_bump_clue_seq
  BEFORE UPDATE ON codewords_boards
  FOR EACH ROW EXECUTE FUNCTION codewords_bump_clue_seq();

DROP FUNCTION IF EXISTS codewords_process_guess(uuid, integer, text);

CREATE OR REPLACE FUNCTION codewords_process_guess(
  p_board_id uuid,
  p_cell_index integer,
  p_player_team text,
  p_clue_seq integer DEFAULT NULL
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
  IF p_clue_seq IS NOT NULL AND v_board.clue_seq IS DISTINCT FROM p_clue_seq THEN
    RAISE EXCEPTION 'STALE_CLUE';
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

REVOKE EXECUTE ON FUNCTION codewords_process_guess(uuid, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION codewords_process_guess(uuid, integer, text, integer) TO service_role;
