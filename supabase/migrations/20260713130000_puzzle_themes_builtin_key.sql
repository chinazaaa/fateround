-- Stable identity for built-in themes seeded from code (CROSSWORD_THEMES / WORD_SEARCH_THEMES /
-- WORD_SCRAMBLE_THEMES). The admin "Import built-in themes" action upserts by this key, so
-- re-running it matches existing rows (preserving any admin edits) instead of duplicating them.
-- NULL for admin-authored themes.

ALTER TABLE puzzle_themes ADD COLUMN IF NOT EXISTS builtin_key text;

-- One row per (game_type, builtin_key) — only enforced for seeded rows (key is not null).
CREATE UNIQUE INDEX IF NOT EXISTS puzzle_themes_builtin_key_unique
  ON puzzle_themes (game_type, builtin_key)
  WHERE builtin_key IS NOT NULL;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted):
--   DROP INDEX IF EXISTS puzzle_themes_builtin_key_unique;
--   ALTER TABLE puzzle_themes DROP COLUMN IF EXISTS builtin_key;
-- ----------------------------------------------------------------------------
