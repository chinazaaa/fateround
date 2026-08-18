-- Allow Word Grouping puzzle packs in the community question library.
--
-- Also repairs a regression from 20260717150000_wst_library_packs.sql, which restated the CHECK
-- without carrying forward the game types added by 20260710180000_quick_draw_library_packs.sql
-- and 20260712{180000,190000,200000}_{crossword_word_search,word_scramble,word_scramble_library_packs}.sql.
-- The DB has silently rejected new packs for quick_draw / crossword / word_search / word_scramble
-- ever since. This migration listing the whole live set is the fix.
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
    'word_scramble',
    'word_grouping',
    'who_said_this'
  ));
