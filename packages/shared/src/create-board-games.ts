import type { LudoVariant } from './types'

export const BOARD_GAME_TURN_TIMER_OPTIONS = [0, 30, 60, 90, 120] as const
export const LUDO_TURN_TIMER_OPTIONS = [0, 30, 60, 90] as const
export const SNAKE_LADDER_TURN_TIMER_OPTIONS = [0, 15, 30, 60, 90] as const
export const WHOT_TURN_TIMER_OPTIONS = [0, 10, 15, 30, 60, 90, 120] as const
export const CRAZY8_TURN_TIMER_OPTIONS = [0, 10, 15, 30, 60, 90, 120] as const
export const MAHJONG_TURN_TIMER_OPTIONS = [0, 30, 60, 90, 120] as const
export const MONOPOLY_TURN_TIMER_OPTIONS = [0, 30, 45, 60, 90] as const
export const TIC_TAC_TOE_TURN_TIMER_OPTIONS = [0, 15, 30, 60] as const

export const CHESS_TIME_OPTIONS = [0, 180, 300, 600] as const
export const CHECKERS_TIME_OPTIONS = [0, 180, 300, 600] as const
export const AYO_TIME_OPTIONS = [0, 30, 180, 300, 600] as const

export const MONOPOLY_GAME_DURATION_OPTIONS = [0, 900, 1800, 2700, 3600, 5400, 7200] as const
export const SCRABBLE_GAME_DURATION_OPTIONS = [0, 600, 900, 1800, 3600, 5400, 7200] as const
export const SCRABBLE_TURN_TIMER_OPTIONS = [0, 60, 120, 180, 300] as const
export const SCRABBLE_CLOCK_OPTIONS = [180, 300, 600, 900, 1200, 1800] as const

export type BoardGameLobbyType =
  | 'monopoly'
  | 'yahtzee'
  | 'whot'
  | 'crazy_eights'
  | 'ludo'
  | 'mahjong'
  | 'snake_and_ladder'

export function turnTimerOptionsFor(gameType: BoardGameLobbyType | 'tic_tac_toe' | 'chess' | 'checkers' | 'ayo' | 'scrabble'): readonly number[] {
  if (gameType === 'ludo') return LUDO_TURN_TIMER_OPTIONS
  if (gameType === 'snake_and_ladder') return SNAKE_LADDER_TURN_TIMER_OPTIONS
  if (gameType === 'mahjong') return MAHJONG_TURN_TIMER_OPTIONS
  if (gameType === 'monopoly') return MONOPOLY_TURN_TIMER_OPTIONS
  if (gameType === 'whot') return WHOT_TURN_TIMER_OPTIONS
  if (gameType === 'crazy_eights') return CRAZY8_TURN_TIMER_OPTIONS
  if (gameType === 'tic_tac_toe') return TIC_TAC_TOE_TURN_TIMER_OPTIONS
  if (gameType === 'chess' || gameType === 'checkers') return CHESS_TIME_OPTIONS
  if (gameType === 'ayo') return AYO_TIME_OPTIONS
  if (gameType === 'scrabble') return SCRABBLE_TURN_TIMER_OPTIONS
  return BOARD_GAME_TURN_TIMER_OPTIONS
}

export function formatBoardGameTurnTimer(seconds: number): string {
  if (!seconds) return 'No timer'
  if (seconds === 120) return '2 minutes'
  if (seconds === 180 && seconds % 60 === 0) return '3 minutes each'
  if (seconds === 300) return '5 minutes each'
  if (seconds === 600) return '10 minutes each'
  return `${seconds} seconds`
}

export function formatChessClockLabel(seconds: number): string {
  if (!seconds) return 'No timer'
  if (seconds === 180) return '3 min each'
  if (seconds === 300) return '5 min each'
  if (seconds === 600) return '10 min each'
  return formatBoardGameTurnTimer(seconds)
}

export function formatAyoClockLabel(seconds: number): string {
  if (!seconds) return 'Casual — no timer'
  if (seconds === 30) return 'Ranked — 30 sec each'
  return formatChessClockLabel(seconds)
}

export function formatSessionDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

export const LUDO_VARIANT_OPTIONS: { value: LudoVariant; label: string; hint: string }[] = [
  {
    value: 'modern',
    label: 'Modern',
    hint: '8 safe squares — starts and star squares',
  },
  {
    value: 'traditional',
    label: 'Traditional',
    hint: 'No safe squares on the shared track',
  },
]

export type AyoVariant = 'traditional' | 'oware'

export const AYO_VARIANT_OPTIONS: { value: AyoVariant; label: string }[] = [
  { value: 'traditional', label: 'Traditional' },
  { value: 'oware', label: 'Oware' },
]

export function parseAyoVariant(raw: unknown): AyoVariant {
  return raw === 'oware' ? 'oware' : 'traditional'
}

export const CHESS_BOARD_THEME_OPTIONS = [
  { id: 'green', label: 'Green' },
  { id: 'classic', label: 'Classic' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'walnut', label: 'Walnut' },
  { id: 'frost', label: 'Frost' },
  { id: 'grape', label: 'Grape' },
  { id: 'rosewood', label: 'Rosewood' },
] as const

export const CHESS_PIECE_SET_OPTIONS = [
  { id: 'neo', label: 'Neo' },
  { id: 'classic', label: 'Classic' },
  { id: 'outline', label: 'Outline' },
  { id: 'ink', label: 'Ink' },
  { id: 'neon', label: 'Neon' },
  { id: 'gold', label: 'Gold' },
] as const

export const CHESS_DEFAULT_BOARD_THEME = 'green'
export const CHESS_DEFAULT_PIECE_SET = 'neo'

export function clampChessBoardTheme(value: unknown): string {
  return CHESS_BOARD_THEME_OPTIONS.some((theme) => theme.id === value) ? String(value) : CHESS_DEFAULT_BOARD_THEME
}

export function clampChessPieceSet(value: unknown): string {
  return CHESS_PIECE_SET_OPTIONS.some((set) => set.id === value) ? String(value) : CHESS_DEFAULT_PIECE_SET
}

export type ScrabbleClockMode = 'standard' | 'chess'

export function parseScrabbleClockMode(value: unknown): ScrabbleClockMode {
  return value === 'chess' ? 'chess' : 'standard'
}

export function formatScrabbleClockMinutes(seconds: number): string {
  return `${seconds / 60} min each`
}

export const PING_PONG_POINTS_OPTIONS = [3, 5, 7, 11] as const
export const PING_PONG_DEFAULT_POINTS = 7

export function clampPingPongPoints(value: unknown): number {
  const n = Number(value)
  return (PING_PONG_POINTS_OPTIONS as readonly number[]).includes(n) ? n : PING_PONG_DEFAULT_POINTS
}

