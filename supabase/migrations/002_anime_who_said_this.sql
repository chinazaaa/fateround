-- ============================================================================
-- Anime Who Said This — schema additions
-- ============================================================================

-- Jikan API response cache (avoid redundant lookups)
CREATE TABLE IF NOT EXISTS jikan_search_cache (
  show_name text PRIMARY KEY,
  mal_id integer,
  cached_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jikan_anime_cache (
  mal_id integer PRIMARY KEY,
  show_name text NOT NULL,
  characters jsonb NOT NULL,
  cached_at timestamptz NOT NULL DEFAULT now()
);

-- Anime quote pool (lobby phase, persists across refreshes)
CREATE TABLE IF NOT EXISTS anime_quote_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  quote_text text NOT NULL,
  anime_name text NOT NULL,
  correct_character text NOT NULL,
  choices jsonb NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE anime_quote_pool ENABLE ROW LEVEL SECURITY;
drop policy if exists "anime_quote_pool_public" on anime_quote_pool;
CREATE POLICY "anime_quote_pool_public" ON anime_quote_pool FOR ALL USING (true) WITH CHECK (true);

-- New columns on existing tables
ALTER TABLE games ADD COLUMN IF NOT EXISTS wst_quote_source text NOT NULL DEFAULT 'player'
  CHECK (wst_quote_source IN ('player', 'anime', 'both'));

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS anime_metadata jsonb;

ALTER TABLE votes ADD COLUMN IF NOT EXISTS anime_choice text;
