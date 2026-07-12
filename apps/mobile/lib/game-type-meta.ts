import type { GameType } from '@fateround/shared'

/** Groups used to organise the create-screen game picker. */
export type GameCategory = 'party' | 'trivia' | 'board' | 'cards' | 'puzzle' | 'custom'

type GameMeta = { emoji: string; blurb: string; category: GameCategory }

const META: Partial<Record<GameType, GameMeta>> = {
  ayo: { emoji: '🌍', blurb: 'Classic sowing game', category: 'board' },
  bingo: { emoji: '🎱', blurb: 'Mark your card', category: 'puzzle' },
  checkers: { emoji: '⬛', blurb: 'Jump and crown', category: 'board' },
  chess: { emoji: '♟️', blurb: 'Strategy on the board', category: 'board' },
  codewords: { emoji: '🕵️', blurb: 'Spymaster clues', category: 'trivia' },
  crazy_eights: { emoji: '🃏', blurb: 'Shed your hand', category: 'cards' },
  crossword: { emoji: '📝', blurb: 'Race to fill the grid', category: 'puzzle' },
  describe_it: { emoji: '💬', blurb: 'Describe without saying', category: 'trivia' },
  i_call_on: { emoji: '🙋', blurb: 'Pick who answers', category: 'party' },
  ludo: { emoji: '🎲', blurb: 'Race your pieces home', category: 'board' },
  mafia: { emoji: '🌙', blurb: 'Find the mafia', category: 'party' },
  mahjong: { emoji: '🀄', blurb: 'Match the tiles', category: 'board' },
  matching_pairs: { emoji: '🧩', blurb: 'Flip and match', category: 'puzzle' },
  monopoly: { emoji: '🏠', blurb: 'Buy and build', category: 'board' },
  quick_draw: { emoji: '✏️', blurb: 'Draw and guess', category: 'trivia' },
  quiplash: { emoji: '✍️', blurb: 'Funniest answer wins', category: 'trivia' },
  scrabble: { emoji: '🔤', blurb: 'Words on the board', category: 'board' },
  snake_and_ladder: { emoji: '🪜', blurb: 'Climb and slide', category: 'board' },
  sudoku: { emoji: '🔢', blurb: 'Fill the grid', category: 'puzzle' },
  tic_tac_toe: { emoji: '❌', blurb: 'Three in a row', category: 'board' },
  trivia: { emoji: '🧠', blurb: 'Quick quiz rounds', category: 'trivia' },
  two_truths: { emoji: '🤥', blurb: 'Spot the lie', category: 'party' },
  whot: { emoji: '🎯', blurb: 'Nigerian card classic', category: 'cards' },
  word_hunt: { emoji: '🔍', blurb: 'Find hidden words', category: 'puzzle' },
  word_rush: { emoji: '⚡', blurb: 'Words under pressure', category: 'puzzle' },
  yahtzee: { emoji: '🎳', blurb: 'Roll for combos', category: 'puzzle' },
  would_you_rather: { emoji: '🤔', blurb: 'Pick your side', category: 'party' },
  this_or_that: { emoji: '⚖️', blurb: 'This or that', category: 'party' },
  never_have_i_ever: { emoji: '🍷', blurb: 'Confess or pass', category: 'party' },
  most_likely_to: { emoji: '👉', blurb: 'Point at someone', category: 'party' },
  who_said_this: { emoji: '💭', blurb: 'Guess the speaker', category: 'party' },
  smash_marry_kill: { emoji: '💘', blurb: 'Rank your picks', category: 'party' },
  smash_or_pass: { emoji: '🔥', blurb: 'Smash or pass', category: 'party' },
  red_flag_green_flag: { emoji: '🚩', blurb: 'Dealbreaker or date', category: 'party' },
  pick_a_number: { emoji: '🔢', blurb: 'Closest wins', category: 'party' },
  parent_approval: { emoji: '👪', blurb: 'Would they approve', category: 'party' },
  secret_message: { emoji: '🤫', blurb: 'Pass a secret', category: 'party' },
  hot_seat: { emoji: '🔥', blurb: 'One player answers all', category: 'party' },
  anonymous_messages: { emoji: '📩', blurb: 'Say it anonymously', category: 'party' },
  custom: { emoji: '🛠️', blurb: 'Build your own rounds', category: 'custom' },
}

const DEFAULT_META: GameMeta = { emoji: '🎮', blurb: 'Party game', category: 'party' }

export function gameTypeMeta(gameType: GameType): GameMeta {
  return META[gameType] ?? DEFAULT_META
}

export function gameTypeCategory(gameType: GameType): GameCategory {
  return (META[gameType] ?? DEFAULT_META).category
}

/** Display order + labels for the category filter chips. */
export const GAME_CATEGORIES: { key: GameCategory; label: string }[] = [
  { key: 'party', label: 'Party' },
  { key: 'trivia', label: 'Guessing' },
  { key: 'board', label: 'Board' },
  { key: 'cards', label: 'Cards' },
  { key: 'puzzle', label: 'Puzzles' },
  { key: 'custom', label: 'Custom' },
]
