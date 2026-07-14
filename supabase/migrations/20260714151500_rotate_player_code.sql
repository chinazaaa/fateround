-- Allow a player to rotate their player code (resume_token) to protect their seat if compromised.

CREATE OR REPLACE FUNCTION rotate_player_resume_token(p_game_id text, p_old_token text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  attempts int := 0;
BEGIN
  -- First, ensure the old token is valid for this game.
  IF NOT EXISTS (
    SELECT 1 FROM players p WHERE p.game_id = p_game_id AND p.resume_token = p_old_token
  ) THEN
    RAISE EXCEPTION 'Player code not found';
  END IF;

  LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    
    -- Ensure uniqueness within the game
    IF NOT EXISTS (
      SELECT 1 FROM players p WHERE p.game_id = p_game_id AND p.resume_token = candidate
    ) THEN
      UPDATE players SET resume_token = candidate WHERE game_id = p_game_id AND resume_token = p_old_token;
      RETURN candidate;
    END IF;

    attempts := attempts + 1;
    IF attempts > 30 THEN
      RAISE EXCEPTION 'Could not generate a new player resume token';
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION rotate_player_resume_token(text, text) TO service_role;
