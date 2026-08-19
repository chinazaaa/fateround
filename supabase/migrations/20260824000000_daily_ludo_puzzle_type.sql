-- Add ludo_puzzle to the daily challenge game-type constraints.

alter table daily_challenges
  drop constraint daily_challenges_valid_game_type,
  add constraint daily_challenges_valid_game_type check (
    game_type in (
      'sudoku', 'word_hunt', 'crossword', 'mini_crossword',
      'word_search', 'word_scramble', 'trivia',
      'whot_puzzle', 'word_grouping', 'chess_mate', 'codenames_codeword',
      'ludo_puzzle'
    )
  );

alter table personal_bests
  drop constraint personal_bests_valid_game_type,
  add constraint personal_bests_valid_game_type check (
    game_type in (
      'sudoku', 'word_hunt', 'crossword', 'mini_crossword',
      'word_search', 'word_scramble', 'trivia',
      'whot_puzzle', 'word_grouping', 'chess_mate', 'codenames_codeword',
      'ludo_puzzle'
    )
  );

alter table daily_challenge_content
  drop constraint daily_content_valid_game_type,
  add constraint daily_content_valid_game_type check (
    game_type in (
      'crossword', 'mini_crossword', 'word_search', 'word_scramble', 'trivia',
      'word_grouping', 'chess_mate', 'codenames_codeword',
      'ludo_puzzle'
    )
  );
