-- Codewords: bind a clue post to the turn it was validated in.
-- The clue route validates against a board read and then writes with a compare-and-swap on
-- (clue empty, no winner, same team). A request held in flight across a full turn cycle (blue,
-- red, blue again) still matches that predicate, because the board is back in an identical state,
-- so a stale clue could land in blue's next turn. turn_seq is bumped by a trigger on every change
-- of current_turn (guess RPC, end-turn, expire-turn, clue-phase timeout alike) and the clue
-- write compares it. Additive only: a column and a trigger, no revoke or drop. Server-only: the
-- column is deliberately not granted to anon/authenticated (they hold column-level SELECT).
ALTER TABLE codewords_boards ADD COLUMN IF NOT EXISTS turn_seq integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION codewords_bump_turn_seq() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.current_turn IS DISTINCT FROM OLD.current_turn THEN
    NEW.turn_seq := OLD.turn_seq + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS codewords_boards_bump_turn_seq ON codewords_boards;
CREATE TRIGGER codewords_boards_bump_turn_seq
  BEFORE UPDATE ON codewords_boards
  FOR EACH ROW EXECUTE FUNCTION codewords_bump_turn_seq();
