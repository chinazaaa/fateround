-- Multiplayer Wordle standings now rank by total_points (points-primary) so a hint-heavy
-- player can never leap the standings — a hint deducts 300 from that word's points, and
-- the ranking uses those points directly.
--
-- Add a running total_points column to wordle_room_progress, bump it inside the
-- record-guess RPC, and backfill it from existing wordle_room_guesses rows.

ALTER TABLE wordle_room_progress
  ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0;

GRANT SELECT (total_points) ON wordle_room_progress TO anon, authenticated;

-- Backfill: sum committed guesses per (round, player). Idempotent — safe to re-run.
UPDATE wordle_room_progress p
SET total_points = COALESCE(sums.pts, 0)
FROM (
  SELECT round_id, player_id, SUM(points_awarded) AS pts
  FROM wordle_room_guesses
  GROUP BY round_id, player_id
) AS sums
WHERE p.round_id = sums.round_id AND p.player_id = sums.player_id;

-- Update the record-guess RPC to bump total_points inside the same locked update. The
-- signature and error contract are unchanged; only the body changes to add the running
-- points column. Kept in a single CREATE OR REPLACE so the existing GRANT stays valid.
CREATE OR REPLACE FUNCTION wordle_room_record_guess(
  p_game_id text,
  p_round_id uuid,
  p_player_id uuid,
  p_word_index integer,
  p_guess text,
  p_state jsonb,
  p_is_correct boolean,
  p_points_awarded integer,
  p_next_word_index integer,
  p_expected_word_guesses integer,
  p_current_word_guesses integer,
  p_words_solved_delta integer,
  p_total_guesses_delta integer,
  p_total_time_ms bigint,
  p_finished boolean,
  p_finished_at timestamptz,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_progress wordle_room_progress%rowtype;
  v_guess_id uuid;
BEGIN
  SELECT * INTO v_progress
    FROM wordle_room_progress
   WHERE round_id = p_round_id AND player_id = p_player_id
   FOR UPDATE;

  IF v_progress.round_id IS NOT NULL THEN
    IF v_progress.finished THEN
      RAISE EXCEPTION 'ALREADY_FINISHED' USING ERRCODE = 'WR001';
    END IF;
    IF v_progress.word_index <> p_word_index THEN
      RAISE EXCEPTION 'STALE_GUESS' USING ERRCODE = 'WR002';
    END IF;
    IF v_progress.current_word_guesses <> p_expected_word_guesses THEN
      RAISE EXCEPTION 'STALE_GUESS' USING ERRCODE = 'WR002';
    END IF;
  END IF;

  INSERT INTO wordle_room_guesses (
    game_id, round_id, player_id, word_index, guess, state, is_correct,
    points_awarded, submitted_at
  ) VALUES (
    p_game_id, p_round_id, p_player_id, p_word_index, p_guess, p_state,
    p_is_correct, p_points_awarded, p_now
  )
  RETURNING id INTO v_guess_id;

  IF v_progress.round_id IS NOT NULL THEN
    UPDATE wordle_room_progress SET
      word_index = p_next_word_index,
      current_word_guesses = p_current_word_guesses,
      words_solved = v_progress.words_solved + p_words_solved_delta,
      total_guesses = v_progress.total_guesses + p_total_guesses_delta,
      total_points = v_progress.total_points + p_points_awarded,
      total_time_ms = p_total_time_ms,
      finished = p_finished,
      finished_at = p_finished_at,
      updated_at = p_now
    WHERE id = v_progress.id;
  ELSE
    BEGIN
      INSERT INTO wordle_room_progress (
        game_id, round_id, player_id, word_index, current_word_guesses,
        words_solved, total_guesses, total_points, total_time_ms, finished, finished_at,
        created_at, updated_at
      ) VALUES (
        p_game_id, p_round_id, p_player_id, p_next_word_index, p_current_word_guesses,
        p_words_solved_delta, p_total_guesses_delta, p_points_awarded, p_total_time_ms, p_finished,
        p_finished_at, p_now, p_now
      );
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_progress
        FROM wordle_room_progress
       WHERE round_id = p_round_id AND player_id = p_player_id
       FOR UPDATE;
      IF v_progress.finished THEN
        RAISE EXCEPTION 'ALREADY_FINISHED' USING ERRCODE = 'WR001';
      END IF;
      IF v_progress.word_index <> p_word_index THEN
        RAISE EXCEPTION 'STALE_GUESS' USING ERRCODE = 'WR002';
      END IF;
      IF v_progress.current_word_guesses <> p_expected_word_guesses THEN
        RAISE EXCEPTION 'STALE_GUESS' USING ERRCODE = 'WR002';
      END IF;
      UPDATE wordle_room_progress SET
        word_index = p_next_word_index,
        current_word_guesses = p_current_word_guesses,
        words_solved = v_progress.words_solved + p_words_solved_delta,
        total_guesses = v_progress.total_guesses + p_total_guesses_delta,
        total_points = v_progress.total_points + p_points_awarded,
        total_time_ms = p_total_time_ms,
        finished = p_finished,
        finished_at = p_finished_at,
        updated_at = p_now
      WHERE id = v_progress.id;
    END;
  END IF;

  RETURN jsonb_build_object(
    'guess_id', v_guess_id,
    'word_index', p_next_word_index,
    'current_word_guesses', p_current_word_guesses,
    'words_solved', COALESCE(v_progress.words_solved, 0) + p_words_solved_delta,
    'total_guesses', COALESCE(v_progress.total_guesses, 0) + p_total_guesses_delta,
    'total_points', COALESCE(v_progress.total_points, 0) + p_points_awarded,
    'finished', p_finished
  );
END;
$$;
