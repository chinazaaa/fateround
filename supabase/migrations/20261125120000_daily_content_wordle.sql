-- Allow admin-curated wordle content.
--
-- Wordle v1 shipped with hardcoded banks only, so 20261009120000_daily_wordle.sql
-- deliberately left `wordle` out of daily_challenge_content's game-type check. The
-- admin batch generator/editor has since gained a full wordle path (bank, textarea
-- parser, generateDailyPuzzleFromContent case), and it generates wordle rows for
-- every date — so every chunked upsert in /api/admin/daily-challenges-content/batch-save
-- carried wordle rows and was rejected by this constraint, failing the whole month's
-- save ("Save failed") rather than just the wordle rows.
--
-- NOT VALID on the ADD keeps the migration from scanning/locking the table while it's
-- still being altered; VALIDATE CONSTRAINT then checks existing rows explicitly. The
-- new list is a superset of the old one, so validation cannot fail on existing rows.

alter table daily_challenge_content
  drop constraint daily_content_valid_game_type,
  add constraint daily_content_valid_game_type check (
    game_type in (
      'crossword', 'mini_crossword', 'word_search', 'word_scramble', 'trivia',
      'word_grouping', 'chess_mate', 'codenames_codeword',
      'ludo_puzzle', 'wordle'
    )
  ) not valid;

alter table daily_challenge_content validate constraint daily_content_valid_game_type;
