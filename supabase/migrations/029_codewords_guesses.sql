CREATE TABLE IF NOT EXISTS codewords_guesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  board_id uuid NOT NULL REFERENCES codewords_boards(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cell_index integer NOT NULL,
  word text NOT NULL,
  cell_type text NOT NULL CHECK (cell_type IN ('red', 'blue', 'neutral', 'assassin')),
  clue_word text,
  clue_number integer,
  team text NOT NULL CHECK (team IN ('red', 'blue')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_codewords_guesses_game_id ON codewords_guesses(game_id);
CREATE INDEX IF NOT EXISTS idx_codewords_guesses_board_id ON codewords_guesses(board_id);

ALTER TABLE codewords_guesses ENABLE ROW LEVEL SECURITY;
drop policy if exists "public_codewords_guesses" on codewords_guesses;
CREATE POLICY "public_codewords_guesses" ON codewords_guesses FOR ALL USING (true) WITH CHECK (true);

do $$ begin alter publication supabase_realtime add table codewords_guesses; exception when duplicate_object then null; end $$;
