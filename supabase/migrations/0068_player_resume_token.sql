-- Per-player resume code for continuing on another device without signing in.
ALTER TABLE players ADD COLUMN IF NOT EXISTS resume_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_players_game_resume_token
  ON players (game_id, resume_token)
  WHERE resume_token IS NOT NULL;

CREATE OR REPLACE FUNCTION set_player_resume_token()
RETURNS TRIGGER AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  attempts int := 0;
BEGIN
  IF NEW.resume_token IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    IF NOT EXISTS (
      SELECT 1 FROM players p
      WHERE p.game_id = NEW.game_id AND p.resume_token = candidate
    ) THEN
      NEW.resume_token := candidate;
      RETURN NEW;
    END IF;
    attempts := attempts + 1;
    IF attempts > 24 THEN
      RAISE EXCEPTION 'Could not generate player resume token';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS players_set_resume_token ON players;
CREATE TRIGGER players_set_resume_token
  BEFORE INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION set_player_resume_token();

-- Backfill existing players.
DO $$
DECLARE
  r record;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  ok boolean;
BEGIN
  FOR r IN SELECT id, game_id FROM players WHERE resume_token IS NULL LOOP
    LOOP
      candidate := '';
      FOR i IN 1..6 LOOP
        candidate := candidate || substr(chars, floor(random() * length(chars))::int + 1, 1);
      END LOOP;
      ok := NOT EXISTS (
        SELECT 1 FROM players p
        WHERE p.game_id = r.game_id AND p.resume_token = candidate AND p.id <> r.id
      );
      EXIT WHEN ok;
    END LOOP;
    UPDATE players SET resume_token = candidate WHERE id = r.id;
  END LOOP;
END $$;
