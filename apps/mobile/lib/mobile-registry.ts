import type { GameType } from '@fateround/shared'
import { MOBILE_SUPPORTED_GAMES } from '@/components/games/GameRouter'

export const GAME_LABELS: Partial<Record<GameType, string>> = {
  ayo: 'Ayo',
  bingo: 'Bingo',
  checkers: 'Checkers: American',
  checkers_international: 'Checkers: International',
  checkers_nigeria: 'Checkers: Nigeria',
  chess: 'Chess',
  scrabble: 'Word Tiles',
  tic_tac_toe: 'Tic-Tac-Toe',
  trivia: 'Trivia',
  would_you_rather: 'Would You Rather',
  monopoly: 'Estate Kings',
  quick_draw: 'Quick Draw',
  matching_pairs: 'Matching Pairs',
  sudoku: 'Sudoku',
  crossword: 'Crossword',
  word_search: 'Word Search',
  word_scramble: 'Word Scramble',
  yahtzee: 'Five Dice',
  snake_and_ladder: 'Snake & Ladder',
  ludo: 'Ludo',
  crazy_eights: 'Crazy Eights',
  whot: 'Whot',
  uno: 'Match Up',
  two_truths: 'Two Truths & a Lie',
  describe_it: 'Text Charades',
  quiplash: 'Punchline',
  word_rush: 'Word Rush',
  word_hunt: 'Word Hunt',
  i_call_on: 'I Call On',
  mafia: 'Mafia',
  codewords: 'Codewords',
  mahjong: 'Mahjong',
  hot_seat: 'Hot Seat',
  custom: 'Custom Game',
  anonymous_messages: 'Anonymous Room',
  secret_message: 'Secret Message',
  landmine: 'Landmine',
  troll_run: 'Troll Run',
  wordle_room: 'Wordle',
  word_grouping: 'Word Grouping',
}

export { MOBILE_SUPPORTED_GAMES }

export function gameLabel(gameType: GameType): string {
  return GAME_LABELS[gameType] ?? gameType.replace(/_/g, ' ')
}
