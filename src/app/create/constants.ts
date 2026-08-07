// Maps the create-page game_type to the corresponding library game_type key.
// Used when loading library packs for lobby-question games.
export const LIBRARY_GAME_TYPE_MAP: Record<string, string> = {
  would_you_rather: 'would_you_rather',
  most_likely_to: 'most_likely_to',
  trivia: 'trivia',
  this_or_that: 'this_or_that',
  never_have_i_ever: 'never_have_i_ever',
  pick_a_number: 'pick_a_number',
  describe_it: 'describe_it',
  quick_draw: 'quick_draw',
  codewords: 'codewords',
  crossword: 'crossword',
  word_search: 'word_search',
  word_scramble: 'word_scramble',
  word_grouping: 'word_grouping',
  who_said_this: 'who_said_this',
}
