-- Atomic hint reveal for multiplayer Wordle.
--
-- Previously the /api/wordle-room/reveal-hint route did SELECT-then-UPDATE across two
-- statements, which meant a concurrent guess submission could commit against the OLD
-- hints_used snapshot — a player who buys a hint mid-guess could then have that word
-- scored WITHOUT the −300 deduction.
--
-- This RPC locks the player's wordle_room_progress row, re-checks finished + word_index
-- under the lock, and appends the requested wordIndex to hints_used atomically. The
-- record-guess RPC (defined in 20261010120000) locks the same row before scoring, so any
-- reveal that commits before a guess is grade-inclusive by construction.

CREATE OR REPLACE FUNCTION wordle_room_reveal_hint(
  p_game_id text,
  p_round_id uuid,
  p_player_id uuid,
  p_word_index integer,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_progress wordle_room_progress%rowtype;
  v_hints jsonb;
  v_already boolean;
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
      RAISE EXCEPTION 'STALE_WORD' USING ERRCODE = 'WR002';
    END IF;

    v_hints := COALESCE(v_progress.hints_used, '[]'::jsonb);
    -- Idempotent: buying the same word's hint twice is a no-op, not an error.
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_hints) elt WHERE elt::text = p_word_index::text
    ) INTO v_already;

    IF NOT v_already THEN
      UPDATE wordle_room_progress
         SET hints_used = v_hints || to_jsonb(p_word_index),
             updated_at = p_now
       WHERE id = v_progress.id;
    END IF;
  ELSE
    -- Late-joined player with no progress row yet — seed one at the requested word so the
    -- purchase sticks even if the player hasn't guessed once yet.
    BEGIN
      INSERT INTO wordle_room_progress (
        game_id, round_id, player_id, word_index, current_word_guesses,
        words_solved, total_guesses, total_points, total_time_ms, finished, finished_at,
        hints_used, created_at, updated_at
      ) VALUES (
        p_game_id, p_round_id, p_player_id, p_word_index, 0,
        0, 0, 0, NULL, false, NULL,
        jsonb_build_array(p_word_index), p_now, p_now
      );
    EXCEPTION WHEN unique_violation THEN
      -- Concurrent guess seeded the row first — re-lock and append.
      SELECT * INTO v_progress
        FROM wordle_room_progress
       WHERE round_id = p_round_id AND player_id = p_player_id
       FOR UPDATE;
      IF v_progress.finished THEN
        RAISE EXCEPTION 'ALREADY_FINISHED' USING ERRCODE = 'WR001';
      END IF;
      IF v_progress.word_index <> p_word_index THEN
        RAISE EXCEPTION 'STALE_WORD' USING ERRCODE = 'WR002';
      END IF;
      v_hints := COALESCE(v_progress.hints_used, '[]'::jsonb);
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_hints) elt WHERE elt::text = p_word_index::text
      ) INTO v_already;
      IF NOT v_already THEN
        UPDATE wordle_room_progress
           SET hints_used = v_hints || to_jsonb(p_word_index),
               updated_at = p_now
         WHERE id = v_progress.id;
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object('word_index', p_word_index, 'already', v_already);
END;
$$;

REVOKE ALL ON FUNCTION public.wordle_room_reveal_hint(text, uuid, uuid, integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wordle_room_reveal_hint(text, uuid, uuid, integer, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wordle_room_reveal_hint(text, uuid, uuid, integer, timestamptz) TO service_role;
