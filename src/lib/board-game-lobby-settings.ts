import type { LobbyLimitGameType } from '@/lib/game-limits'
import { MONOPOLY_TURN_TIMER_OPTIONS } from '@/lib/monopoly'
import { MONOPOLY_DEFAULT_TURN_TIMER } from '@/lib/supabase-selects'

export const BOARD_GAME_TURN_TIMER_OPTIONS = [0, 30, 60, 90, 120] as const
export const LUDO_TURN_TIMER_OPTIONS = [0, 30, 60, 90] as const

export type BoardGameLobbyType = 'monopoly' | 'yahtzee' | 'whot' | 'ludo'

export function boardGameToLobbyLimitType(gameType: BoardGameLobbyType): LobbyLimitGameType {
  return gameType
}

export function turnTimerOptionsFor(gameType: BoardGameLobbyType): readonly number[] {
  if (gameType === 'ludo') return LUDO_TURN_TIMER_OPTIONS
  if (gameType === 'monopoly') return MONOPOLY_TURN_TIMER_OPTIONS
  return BOARD_GAME_TURN_TIMER_OPTIONS
}

export function clampBoardGameTurnTimer(raw: unknown, gameType: BoardGameLobbyType): number {
  const opts = turnTimerOptionsFor(gameType)
  const n = Number(raw ?? 0)
  if ((opts as readonly number[]).includes(n)) return n
  return gameType === 'ludo' ? 0 : MONOPOLY_DEFAULT_TURN_TIMER
}

export function formatBoardGameTurnTimer(seconds: number): string {
  if (!seconds) return 'No timer'
  if (seconds === 120) return '2 minutes'
  return `${seconds} seconds`
}
