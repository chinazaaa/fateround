import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameStatus } from '@/types'

/** Safe, non-secret columns exposed by the public /browse list (never host_token). */
export const GAME_BROWSE_FIELDS =
  'id, title, game_type, status, max_players, allow_late_players, created_at, scheduled_at'

export type BrowseGameRow = {
  id: string
  title: string
  game_type: string
  status: GameStatus | 'scheduled'
  max_players: number | null
  allow_late_players: boolean | null
  created_at: string
  scheduled_at: string | null
}

export type PublicGame = BrowseGameRow & { playerCount: number; viewerCount: number }

export type GameAttendance = { playerCount: number; viewerCount: number }

/**
 * Tally attendance per game in one query (there is no denormalized count column).
 *
 * Splits real players from spectators so the browse/live-games UI can render "6/6 players ·
 * 3 watching" instead of "9/6 players" — the latter reads as "9 out of 6" (impossible) when
 * really the extra 3 joined as viewers. Full-lobby checks always use playerCount so a game
 * isn't marked full because too many people are watching.
 */
export async function countPlayersByGame(
  supabase: SupabaseClient,
  gameIds: string[]
): Promise<Record<string, GameAttendance>> {
  if (gameIds.length === 0) return {}

  const { data: rows, error } = await supabase.from('players').select('game_id, spectator').in('game_id', gameIds)
  // Don't silently report every game as "0 players" on a query error — surface it so
  // the caller can log/decide, rather than shipping misleading counts.
  if (error) throw error

  const counts: Record<string, GameAttendance> = {}
  for (const id of gameIds) counts[id] = { playerCount: 0, viewerCount: 0 }
  for (const row of rows ?? []) {
    const entry = counts[row.game_id as string]
    if (!entry) continue
    if ((row as { spectator?: boolean | null }).spectator === true) entry.viewerCount += 1
    else entry.playerCount += 1
  }
  return counts
}
