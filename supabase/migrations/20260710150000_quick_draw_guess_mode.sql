-- Quick Draw — Guess mode (draw a word, teammates guess) alongside Lie mode (Drawful).

ALTER TABLE games ADD COLUMN IF NOT EXISTS quick_draw_variant text NOT NULL DEFAULT 'lie'
  CHECK (quick_draw_variant IN ('lie', 'guess'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS quick_draw_play_mode text NOT NULL DEFAULT 'team'
  CHECK (quick_draw_play_mode IN ('team', 'individual'));
ALTER TABLE games ADD COLUMN IF NOT EXISTS quick_draw_num_teams integer NOT NULL DEFAULT 2;

CREATE TABLE IF NOT EXISTS quick_draw_guess_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('team', 'individual')),
  num_teams integer NOT NULL,
  total_rounds integer NOT NULL,
  turn_seconds integer NOT NULL,
  roster text[] NOT NULL DEFAULT '{}',
  phase text NOT NULL DEFAULT 'turn' CHECK (phase IN ('turn', 'break', 'finished')),
  turn_index integer NOT NULL DEFAULT 0,
  current_round integer NOT NULL DEFAULT 1,
  active_team integer NOT NULL DEFAULT 1,
  drawer_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  current_word text,
  current_stroke_data jsonb NOT NULL DEFAULT '{}',
  used_words text[] NOT NULL DEFAULT '{}',
  turn_deadline_at timestamptz,
  break_deadline_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  status_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quick_draw_guess_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team integer NOT NULL,
  score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(game_id, player_id)
);

CREATE TABLE IF NOT EXISTS quick_draw_guess_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  round integer NOT NULL,
  team integer NOT NULL,
  drawer_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  word text NOT NULL,
  status text NOT NULL CHECK (status IN ('guessed', 'skipped')),
  guesser_player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quick_draw_guess_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team integer NOT NULL DEFAULT 0,
  text text NOT NULL,
  correct boolean NOT NULL DEFAULT false,
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_draw_guess_guesses_scored_unique
  ON quick_draw_guess_guesses (game_id, turn_index, player_id)
  WHERE correct AND points > 0;

CREATE INDEX IF NOT EXISTS idx_quick_draw_guess_sessions_game_id ON quick_draw_guess_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_quick_draw_guess_players_game_id ON quick_draw_guess_players(game_id);
CREATE INDEX IF NOT EXISTS idx_quick_draw_guess_words_game_id ON quick_draw_guess_words(game_id);
CREATE INDEX IF NOT EXISTS idx_quick_draw_guess_guesses_game_id ON quick_draw_guess_guesses(game_id);

ALTER TABLE quick_draw_guess_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quick_draw_guess_sessions" ON quick_draw_guess_sessions;
CREATE POLICY "public_quick_draw_guess_sessions" ON quick_draw_guess_sessions FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quick_draw_guess_players ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quick_draw_guess_players" ON quick_draw_guess_players;
CREATE POLICY "public_quick_draw_guess_players" ON quick_draw_guess_players FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quick_draw_guess_words ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quick_draw_guess_words" ON quick_draw_guess_words;
CREATE POLICY "public_quick_draw_guess_words" ON quick_draw_guess_words FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE quick_draw_guess_guesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_quick_draw_guess_guesses" ON quick_draw_guess_guesses;
CREATE POLICY "public_quick_draw_guess_guesses" ON quick_draw_guess_guesses FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table quick_draw_guess_sessions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table quick_draw_guess_players; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table quick_draw_guess_words; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table quick_draw_guess_guesses; exception when duplicate_object then null; end $$;

CREATE OR REPLACE FUNCTION quick_draw_guess_record_correct_guess(
  p_game_id text,
  p_turn_index integer,
  p_player_id uuid,
  p_text text,
  p_points integer
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO quick_draw_guess_guesses (game_id, turn_index, player_id, team, text, correct, points)
  VALUES (p_game_id, p_turn_index, p_player_id, 0, p_text, true, p_points)
  ON CONFLICT (game_id, turn_index, player_id) WHERE correct AND points > 0
  DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN false;
  END IF;

  UPDATE quick_draw_guess_players
  SET score = score + p_points
  WHERE game_id = p_game_id AND player_id = p_player_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION quick_draw_guess_add_score(
  p_game_id text,
  p_player_id uuid,
  p_delta integer
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE quick_draw_guess_players
  SET score = score + p_delta
  WHERE game_id = p_game_id AND player_id = p_player_id;
END;
$$;
