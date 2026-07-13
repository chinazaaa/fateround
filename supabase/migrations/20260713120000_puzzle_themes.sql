-- Admin-authored puzzle themes for Crossword / Word Search / Word Scramble.
--
-- A "theme" is just a named word pool plus an optional locked difficulty. Hosts pick it from
-- the same theme dropdown as the built-in themes (which stay in code as CROSSWORD_THEMES etc.);
-- on selection the entries are copied into games.custom_questions server-side and the game runs
-- through the existing custom-pool pipeline. So this table needs NO changes to the puzzle
-- generators or start routes.
--
-- SECURITY: `entries` holds crossword answers and word-scramble solutions, which are secret
-- (mirrors crossword_solutions / word_scramble_solutions being server-only). So RLS is enabled
-- with NO policy at all — every read/write goes through the service-role API routes
-- (admin CRUD + POST /api/games, which fold entries into custom_questions). Anon never reads
-- this table directly; the public dropdown route returns metadata only (name/difficulty/count),
-- never the entries.

CREATE TABLE IF NOT EXISTS puzzle_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type text NOT NULL CHECK (game_type IN ('crossword', 'word_search', 'word_scramble')),
  name text NOT NULL,
  -- NULL = host still chooses the difficulty (like the built-in themes). A set value LOCKS the
  -- difficulty to the theme (e.g. "Geography Hard"), applied to the game when the theme is picked.
  difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),
  -- Per-game item shape (matches the custom-pool parsers): crossword {answer,clue},
  -- word_search {word}, word_scramble {word, hint?}.
  entries jsonb NOT NULL DEFAULT '[]',
  entry_count integer NOT NULL DEFAULT 0,
  -- Reserved for a future "backfill built-ins into the DB" step so official themes are editable
  -- here too; today built-ins live in code and this table holds only admin-authored themes.
  is_builtin boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS puzzle_themes_game_type_idx ON puzzle_themes (game_type, sort_order, created_at);

-- RLS on, deliberately NO policy: PostgREST denies all anon/authenticated access. Only the
-- service-role API routes touch this table. (Same pattern as crossword_solutions' read denial.)
ALTER TABLE puzzle_themes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted):
--   DROP TABLE IF EXISTS puzzle_themes;
-- ----------------------------------------------------------------------------
