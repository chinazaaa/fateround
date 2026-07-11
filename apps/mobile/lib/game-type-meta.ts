import type { GameType } from '@fateround/shared'

const META: Partial<Record<GameType, { emoji: string; blurb: string }>> = {
  ayo: { emoji: '🌍', blurb: 'Classic sowing game' },
  bingo: { emoji: '🎱', blurb: 'Mark your card' },
  checkers: { emoji: '⬛', blurb: 'Jump and crown' },
  chess: { emoji: '♟️', blurb: 'Strategy on the board' },
  codewords: { emoji: '🕵️', blurb: 'Spymaster clues' },
  crazy_eights: { emoji: '🃏', blurb: 'Shed your hand' },
  describe_it: { emoji: '💬', blurb: 'Describe without saying' },
  i_call_on: { emoji: '🙋', blurb: 'Pick who answers' },
  ludo: { emoji: '🎲', blurb: 'Race your pieces home' },
  mafia: { emoji: '🌙', blurb: 'Find the mafia' },
  matching_pairs: { emoji: '🧩', blurb: 'Flip and match' },
  monopoly: { emoji: '🏠', blurb: 'Buy and build' },
  quiplash: { emoji: '✍️', blurb: 'Funniest answer wins' },
  scrabble: { emoji: '🔤', blurb: 'Words on the board' },
  snake_and_ladder: { emoji: '🪜', blurb: 'Climb and slide' },
  sudoku: { emoji: '🔢', blurb: 'Fill the grid' },
  tic_tac_toe: { emoji: '❌', blurb: 'Three in a row' },
  trivia: { emoji: '🧠', blurb: 'Quick quiz rounds' },
  two_truths: { emoji: '🤥', blurb: 'Spot the lie' },
  whot: { emoji: '🎯', blurb: 'Nigerian card classic' },
  word_hunt: { emoji: '🔍', blurb: 'Find hidden words' },
  word_rush: { emoji: '⚡', blurb: 'Words under pressure' },
  yahtzee: { emoji: '🎳', blurb: 'Roll for combos' },
  would_you_rather: { emoji: '🤔', blurb: 'Pick your side' },
  this_or_that: { emoji: '⚖️', blurb: 'This or that' },
  never_have_i_ever: { emoji: '🍷', blurb: 'Confess or pass' },
  most_likely_to: { emoji: '👉', blurb: 'Point at someone' },
  who_said_this: { emoji: '💭', blurb: 'Guess the speaker' },
  smash_marry_kill: { emoji: '💘', blurb: 'Rank your picks' },
  smash_or_pass: { emoji: '🔥', blurb: 'Smash or pass' },
  red_flag_green_flag: { emoji: '🚩', blurb: 'Dealbreaker or date' },
  pick_a_number: { emoji: '🔢', blurb: 'Closest wins' },
  parent_approval: { emoji: '👪', blurb: 'Would they approve' },
}

export function gameTypeMeta(gameType: GameType) {
  return META[gameType] ?? { emoji: '🎮', blurb: 'Party game' }
}
