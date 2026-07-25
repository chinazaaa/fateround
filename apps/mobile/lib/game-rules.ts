import type { GameType } from '@fateround/shared'
import { WEB_BASE_URL } from '@/lib/config'

/** Slug segment for `/games/{slug}#rules` — mirrors `src/lib/game-landing.ts`. */
const GAME_TYPE_TO_SLUG: Record<GameType, string> = {
  smash_marry_kill: 'smash-marry-kill',
  red_flag_green_flag: 'red-flag-green-flag',
  smash_or_pass: 'smash-or-pass',
  parent_approval: 'date-my-kid',
  would_you_rather: 'would-you-rather',
  never_have_i_ever: 'never-have-i-ever',
  pick_a_number: 'pick-a-number',
  this_or_that: 'this-or-that',
  most_likely_to: 'most-likely-to',
  who_said_this: 'who-said-this',
  hot_seat: 'hot-seat',
  custom: 'custom-game',
  anonymous_messages: 'anonymous-room',
  secret_message: 'secret-message',
  bingo: 'bingo',
  codewords: 'codewords',
  trivia: 'trivia',
  two_truths: 'two-truths-and-a-lie',
  monopoly: 'monopoly',
  yahtzee: 'yahtzee',
  whot: 'whot',
  crazy_eights: 'crazy-eights',
  ludo: 'ludo',
  mahjong: 'mahjong',
  i_call_on: 'i-call-on',
  sudoku: 'sudoku',
  crossword: 'crossword',
  word_search: 'word-search',
  word_scramble: 'word-scramble',
  tic_tac_toe: 'tic-tac-toe',
  ping_pong: 'ping-pong',
  word_hunt: 'word-hunt',
  chess: 'chess',
  checkers: 'checkers',
  checkers_international: 'checkers-international',
  checkers_nigeria: 'checkers-nigeria',
  ayo: 'ayo',
  describe_it: 'text-charades',
  word_rush: 'word-rush',
  scrabble: 'scrabble',
  snake_and_ladder: 'snakes-and-ladders',
  mafia: 'mafia',
  matching_pairs: 'matching-pairs',
  quiplash: 'quiplash',
  quick_draw: 'quick-draw',
  landmine: 'landmine',
}

export function gameRulesUrl(gameType: GameType | string): string | null {
  const slug = GAME_TYPE_TO_SLUG[gameType as GameType]
  if (!slug) return null
  return `${WEB_BASE_URL}/games/${slug}#rules`
}
