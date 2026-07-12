-- Word Scramble letter hints: a player can reveal the current word's letters one at a time for a
-- per-letter points penalty (separate from the full "Reveal", which solves the word for a flat
-- penalty). We store only the COUNT of letters revealed per (player, round, scramble) — never any
-- answer text — so the row is safe to expose to clients for live/finished score tallies.
-- All writes go through the service-role API route; the table is read-only to anon.
CREATE TABLE IF NOT EXISTS word_scramble_hints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  scramble_index integer NOT NULL CHECK (scramble_index >= 0),
  letters integer NOT NULL DEFAULT 0 CHECK (letters >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_word_scramble_hints_game_id ON word_scramble_hints(game_id);
CREATE INDEX IF NOT EXISTS idx_word_scramble_hints_round_id ON word_scramble_hints(round_id);

-- One hint row per (player, round, scramble); the API upserts and increments `letters`.
CREATE UNIQUE INDEX IF NOT EXISTS word_scramble_hints_player_index_unique
  ON word_scramble_hints (player_id, round_id, scramble_index);

ALTER TABLE word_scramble_hints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "word_scramble_hints_read" ON word_scramble_hints;
CREATE POLICY "word_scramble_hints_read" ON word_scramble_hints FOR SELECT USING (true);

-- Live score updates as players spend hints.
do $$ begin alter publication supabase_realtime add table word_scramble_hints; exception when duplicate_object then null; end $$;
