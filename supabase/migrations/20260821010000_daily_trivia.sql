-- Add trivia to daily_challenges check constraint.

alter table daily_challenges
  drop constraint daily_challenges_valid_game_type,
  add constraint daily_challenges_valid_game_type check (
    game_type in ('sudoku', 'word_hunt', 'crossword', 'word_search', 'word_scramble', 'trivia')
  );

-- Same for personal_bests.
alter table personal_bests
  drop constraint personal_bests_valid_game_type,
  add constraint personal_bests_valid_game_type check (
    game_type in ('sudoku', 'word_hunt', 'crossword', 'word_search', 'word_scramble', 'trivia')
  );
