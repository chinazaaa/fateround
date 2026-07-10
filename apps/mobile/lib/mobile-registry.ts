import type { GameType } from '@fateround/shared'
import { MOBILE_SUPPORTED_GAMES } from '@/components/games/GameRouter'

export const GAME_LABELS: Partial<Record<GameType, string>> = {
  ayo: 'Ayo',
  bingo: 'Bingo',
  checkers: 'Checkers',
  chess: 'Chess',
  tic_tac_toe: 'Tic Tac Toe',
  trivia: 'Trivia',
  would_you_rather: 'Would You Rather',
  monopoly: 'Monopoly',
  quick_draw: 'Quick Draw',
  matching_pairs: 'Matching Pairs',
  sudoku: 'Sudoku',
  yahtzee: 'Yahtzee',
  snake_and_ladder: 'Snakes & Ladders',
  ludo: 'Ludo',
  crazy_eights: 'Crazy Eights',
  whot: 'Whot',
  two_truths: 'Two Truths & a Lie',
  describe_it: 'Describe It',
  quiplash: 'Quiplash',
  word_rush: 'Word Rush',
  word_hunt: 'Word Hunt',
  i_call_on: 'I Call On',
}

export { MOBILE_SUPPORTED_GAMES }

export function gameLabel(gameType: GameType): string {
  return GAME_LABELS[gameType] ?? gameType.replace(/_/g, ' ')
}
