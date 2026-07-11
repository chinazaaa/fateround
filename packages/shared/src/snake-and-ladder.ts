import type { Player, SnakeLadderColor, SnakeLadderPlayerState, SnakeLadderSession } from './types'

export const SNAKE_LADDER_MIN_PLAYERS = 2
export const SNAKE_LADDER_MAX_PLAYERS = 6
export const SNAKE_LADDER_DEFAULT_MAX_PLAYERS = 4

/** Final square — land here exactly to win. */
export const SNAKE_LADDER_GOAL = 100

/** Classic Milton-Bradley board. Ladders climb up: bottom → top. */
export const LADDERS: Readonly<Record<number, number>> = {
  1: 38,
  4: 14,
  9: 31,
  21: 42,
  28: 84,
  36: 44,
  51: 67,
  71: 91,
  80: 100,
}

/** Snakes slide down: head → tail. */
export const SNAKES: Readonly<Record<number, number>> = {
  16: 6,
  47: 26,
  49: 11,
  56: 53,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  98: 78,
}

/** Combined jump map — every square that teleports you somewhere else. */
export const JUMPS: Readonly<Record<number, number>> = { ...LADDERS, ...SNAKES }

export const SNAKE_LADDER_COLORS: SnakeLadderColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange']

export const SNAKE_LADDER_COLOR_LABELS: Record<SnakeLadderColor, string> = {
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  yellow: 'Yellow',
  purple: 'Purple',
  orange: 'Orange',
}

export const SNAKE_LADDER_COLOR_HEX: Record<SnakeLadderColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316',
}

/** Assign distinct colors in seating order. */
export function colorsForPlayerCount(count: number): SnakeLadderColor[] {
  return SNAKE_LADDER_COLORS.slice(0, Math.max(0, count))
}

function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

export function currentPlayerId(session: SnakeLadderSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  return order[session.current_turn_index % order.length] ?? null
}

export function snakeLadderTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function snakeLadderSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1
}

export type SnakeLadderStanding = {
  playerId: string
  name: string
  color: SnakeLadderColor
  position: number
  rank: number
}

export function buildSnakeLadderStandings(
  states: SnakeLadderPlayerState[],
  players: Player[],
  winnerPlayerId?: string | null
): SnakeLadderStanding[] {
  const rows = states.map((state) => ({
    playerId: state.player_id,
    name: players.find((p) => p.id === state.player_id)?.name ?? 'Player',
    color: state.color,
    position: state.position,
  }))

  rows.sort((a, b) => {
    if (winnerPlayerId) {
      if (a.playerId === winnerPlayerId) return -1
      if (b.playerId === winnerPlayerId) return 1
    }
    return b.position - a.position || a.name.localeCompare(b.name)
  })

  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}
