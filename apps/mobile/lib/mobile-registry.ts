import type { GameType } from '@fateround/shared'
import { BATCH_1_GAMES } from '@/components/games/GameRouter'

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
}

export const MOBILE_SUPPORTED_GAMES = BATCH_1_GAMES

export function gameLabel(gameType: GameType): string {
  return GAME_LABELS[gameType] ?? gameType.replace(/_/g, ' ')
}
