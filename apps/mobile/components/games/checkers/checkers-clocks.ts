import type { CheckersColor, CheckersSession } from '@fateround/shared'

/** True when the match is timed (both players have a clock budget). */
export function checkersIsTimed(session: CheckersSession): boolean {
  return session.red_time_ms != null && session.black_time_ms != null
}

/**
 * Remaining clock for `color` in ms. Only the player on the move burns time, so
 * the active side's remaining is base minus elapsed since their turn started.
 */
export function liveCheckersClockMs(session: CheckersSession, color: CheckersColor): number {
  const base = color === 'r' ? session.red_time_ms : session.black_time_ms
  if (base == null) return 0
  const active = session.status === 'active' && session.current_turn === color
  if (!active || !session.turn_started_at) return Math.max(0, base)
  return Math.max(0, base - Math.max(0, Date.now() - Date.parse(session.turn_started_at)))
}

/** Format remaining clock ms as m:ss (always reads as a clock, e.g. 10:00, 0:05). */
export function formatCheckersClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Human-readable end-of-game reason. */
export function checkersResultDetail(reason: string | null): string | null {
  switch (reason) {
    case 'capture_all':
      return 'All pieces captured'
    case 'no_moves':
      return 'No legal moves'
    case 'draw_moves':
      return '40-move draw rule'
    case 'timeout':
      return 'Out of time'
    case 'resignation':
      return 'Resigned'
    default:
      return null
  }
}
