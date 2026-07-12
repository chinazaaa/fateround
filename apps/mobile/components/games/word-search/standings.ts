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

/** Time spent by a player in seconds. If completed, stops at their final word found. */
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
  if (completionPercent >= 100) {
    const mine = found
      .filter((f) => f.player_id === playerId && f.found_at)
      .sort((a, b) => new Date(a.found_at as string).getTime() - new Date(b.found_at as string).getTime())
    if (mine.length > 0) {
      const last = mine[mine.length - 1]!
      const endMs = new Date(last.found_at as string).getTime()
      if (Number.isFinite(endMs)) return Math.max(0, Math.floor((endMs - startMs) / 1000))
    }
  }
  const endMs = completionPercent < 100 && game.finished_at ? new Date(game.finished_at).getTime() : nowMs
  return Math.max(0, Math.floor((endMs - startMs) / 1000))
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
