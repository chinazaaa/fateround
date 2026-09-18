/**
 * The values `question_packs.game_type` accepts, transcribed from the live CHECK constraint in
 * supabase/migrations/20260810120000_word_grouping_library_packs.sql (the last migration to
 * restate `question_packs_game_type_check`) and kept in its order.
 *
 * This lives in its own module rather than beside the handler that gates on it because a
 * Next.js route file may only export route fields — `export const VALID_GAME_TYPES` in
 * src/app/api/admin/library/[id]/route.ts fails the build with *"VALID_GAME_TYPES" is not a
 * valid Route export field* — and the test that pins this list against the constraint has to be
 * able to import it. A pin that only re-typed the list would not be a pin.
 *
 * Keep it equal to that constraint. Widening it past the constraint turns a clean 400 into a
 * 500 from the DB; narrowing it strands packs, which is the drift this module was extracted to
 * fix: the admin route listed 10 of these 14, so `crossword`, `word_search`, `word_scramble`
 * and `word_grouping` were rejected with 400 "Invalid game_type" for values the DB takes.
 *
 * That drift is one of omission, not removal — the admin route's list never held `crossword`,
 * `word_search`, `word_scramble` or `word_grouping` at all (`git log -L 25,36` on it shows
 * 3 -> 8 -> +quick_draw -> +who_said_this and nothing else). `quick_draw` and `who_said_this`
 * were added to the route alongside their migrations; these four were not, each widening the DB
 * while the route stood still:
 * 20260712180000_crossword_word_search_library_packs.sql (crossword, word_search),
 * 20260712{190000,200000}_word_scramble*.sql (word_scramble), and
 * 20260810120000_word_grouping_library_packs.sql (word_grouping). 20260810120000 also repairs a
 * *constraint* regression left by 20260717150000_wst_library_packs.sql — a separate matter from
 * this list, which 20260717150000 only added who_said_this to.
 *
 * Other copies of this list still exist in the admin and public library pages and disagree with
 * the constraint; they are deliberately left alone for a follow-up, and this module is where
 * they should converge.
 */
export const QUESTION_PACK_GAME_TYPES = [
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
  'who_said_this',
]
