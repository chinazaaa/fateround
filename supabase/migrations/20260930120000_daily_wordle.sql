-- Add wordle to the daily challenge game-type constraints.
--
-- Wordle v1 ships with hardcoded banks only (no admin-curated content path), so the
-- daily_challenge_content constraint is intentionally NOT extended here. The GET route's
-- fallback chain (daily_challenge_content -> generateDailyPuzzle) already skips the content
-- table when no wordle row exists.

alter table daily_challenges
  drop constraint daily_challenges_valid_game_type,
  add constraint daily_challenges_valid_game_type check (
    game_type in (
      'sudoku', 'word_hunt', 'crossword', 'mini_crossword',
      'word_search', 'word_scramble', 'trivia',
      'whot_puzzle', 'word_grouping', 'chess_mate', 'codenames_codeword',
      'ludo_puzzle', 'wordle'
    )
  );

alter table personal_bests
  drop constraint personal_bests_valid_game_type,
  add constraint personal_bests_valid_game_type check (
    game_type in (
      'sudoku', 'word_hunt', 'crossword', 'mini_crossword',
      'word_search', 'word_scramble', 'trivia',
      'whot_puzzle', 'word_grouping', 'chess_mate', 'codenames_codeword',
      'ludo_puzzle', 'wordle'
    )
  );