import type { WordSearchFound } from '@fateround/shared'

// Word Search presentation helpers, colocated with the mobile Word Search view (mirrors the
// mobile Crossword `standings.ts`). Scoring + grid logic lives in `@fateround/shared/word-search`;
// this file only holds palette + time/format helpers used by the view.

type FoundLike = Pick<WordSearchFound, 'player_id'> & { found_at?: string | null }

/** Indigo highlight for cells the current player has found. */
export const WORD_SEARCH_MY_CELL_COLOR = '#6366f1'

/** Distinct accent colors for up to 20 players (by join order), mirroring web palette. */
export const WORD_SEARCH_PLAYER_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#0ea5e9',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#f97316',
  '#84cc16',
  '#818cf8',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#38bdf8',
  '#c084fc',
  '#fb7185',
  '#2dd4bf',
  '#fdba74',
  '#a3e635',
] as const

export function wordSearchPlayerColor(index: number): string {
  return WORD_SEARCH_PLAYER_COLORS[index % WORD_SEARCH_PLAYER_COLORS.length]!
}

/**
 * Time spent by a player in seconds.
 *
 * Once a player's round is over — they found everything, or the game finished — the clock stops
 * at their last find. That is the quantity the leaderboard already breaks score ties on (each
 * player's latest find), so the figure shown and the figure ranked by are the same thing: when
 * the player stopped, not how long the round ran. Previously only a 100% finisher got that
 * treatment and everyone else was shown the whole round, which made a partial solver who won on
 * points look slower than the player they beat.
 *
 * A player still playing keeps a running clock, and one who found nothing is shown the whole
 * round, since there is no moment they stopped at.
 */
export function getPlayerTimeSpent(
  game: { session_started_at?: string | null; finished_at?: string | null } | null,
  found: FoundLike[],
  playerId: string,
  completionPercent: number,
  nowMs: number,
  playerJoinedAt?: string | null
): number {
  if (!game?.session_started_at) return 0
  const sessionStartMs = new Date(game.session_started_at).getTime()
  const joinedMs = playerJoinedAt ? new Date(playerJoinedAt).getTime() : sessionStartMs
  const startMs = Number.isFinite(joinedMs) ? Math.max(sessionStartMs, joinedMs) : sessionStartMs
  const finishedRaw = game.finished_at ? new Date(game.finished_at).getTime() : NaN
  const finishedMs = Number.isFinite(finishedRaw) ? finishedRaw : null
  if (completionPercent >= 100 || finishedMs !== null) {
    const mine = found
      .filter((f) => f.player_id === playerId && f.found_at)
      .sort((a, b) => new Date(a.found_at as string).getTime() - new Date(b.found_at as string).getTime())
    if (mine.length > 0) {
      const lastMs = new Date(mine[mine.length - 1]!.found_at as string).getTime()
      // Clamped: a write that lands after the round closed is not extra play time.
      const endMs = finishedMs !== null ? Math.min(lastMs, finishedMs) : lastMs
      if (Number.isFinite(endMs)) return Math.max(0, Math.floor((endMs - startMs) / 1000))
    }
  }
  return Math.max(0, Math.floor(((finishedMs ?? nowMs) - startMs) / 1000))
}

export function formatMinutesSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function ordinal(n: number): string {
  const j = n % 10
  const k = n % 100
  if (j === 1 && k !== 11) return `${n}st`
  if (j === 2 && k !== 12) return `${n}nd`
  if (j === 3 && k !== 13) return `${n}rd`
  return `${n}th`
}
