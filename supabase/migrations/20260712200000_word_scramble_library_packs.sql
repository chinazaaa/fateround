-- Allow Word Scramble (word + optional hint) packs in the community question library.
alter table question_packs drop constraint if exists question_packs_game_type_check;
alter table question_packs add constraint question_packs_game_type_check
  check (game_type in (
    'trivia',
    'would_you_rather',
    'most_likely_to',
    'this_or_that',
    'never_have_i_ever',
    'describe_it',
    'quick_draw',
    'codewords',
    'pick_a_number',
    'crossword',
    'word_search',
    'word_scramble'
  ));
