-- Add mini_crossword (and remaining new daily types) to check constraints.

-- daily_challenges: add whot_puzzle, word_grouping, chess_mate, codenames_codeword, mini_crossword
alter table daily_challenges
  drop constraint daily_challenges_valid_game_type,
  add constraint daily_challenges_valid_game_type check (
    game_type in (
      'sudoku', 'word_hunt', 'crossword', 'mini_crossword',
      'word_search', 'word_scramble', 'trivia',
      'whot_puzzle', 'word_grouping', 'chess_mate', 'codenames_codeword'
    )
  );

-- personal_bests: same set
alter table personal_bests
  drop constraint personal_bests_valid_game_type,
  add constraint personal_bests_valid_game_type check (
    game_type in (
      'sudoku', 'word_hunt', 'crossword', 'mini_crossword',
      'word_search', 'word_scramble', 'trivia',
      'whot_puzzle', 'word_grouping', 'chess_mate', 'codenames_codeword'
    )
  );

-- daily_challenge_content: add mini_crossword, word_grouping, chess_mate, codenames_codeword
alter table daily_challenge_content
  drop constraint daily_content_valid_game_type,
  add constraint daily_content_valid_game_type check (
    game_type in (
      'crossword', 'mini_crossword',
      'word_search', 'word_scramble', 'trivia',
      'word_grouping', 'chess_mate', 'codenames_codeword'
    )
  );
