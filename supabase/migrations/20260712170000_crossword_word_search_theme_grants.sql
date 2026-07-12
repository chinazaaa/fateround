-- Grant anon/authenticated SELECT on the crossword/word-search theme + difficulty columns.
--
-- Migration 0122 switched `games` to COLUMN-level SELECT grants for the public roles
-- (so the secret host_token stays unreadable). `ADD COLUMN` does NOT extend those column
-- grants, so crossword_theme/crossword_difficulty (20260712120000_crossword.sql) and
-- word_search_theme/word_search_difficulty (20260712140000_word_search.sql) are not readable
-- by anon/authenticated. The lobby settings editor needs to read the CURRENT theme/difficulty
-- to highlight the active choice, so add them to GAME_SELECT — which requires this grant, or
-- the anon `games` select errors with 42501. These are non-secret puzzle config, safe to
-- expose (the grid/word list is public during play anyway). Mirrors the crazy8_* grant.
--
-- Done as a separate forward migration because the crossword/word-search migrations have
-- already shipped — shipped migrations are immutable (see CONTRIBUTING.md).

GRANT SELECT (crossword_theme, crossword_difficulty, word_search_theme, word_search_difficulty)
  ON public.games TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- ROLLBACK (drafted): revoke the read grant on these columns.
--   revoke select (crossword_theme, crossword_difficulty, word_search_theme, word_search_difficulty)
--     on public.games from anon, authenticated;
-- ----------------------------------------------------------------------------
