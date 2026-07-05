import type { SupabaseClient } from '@supabase/supabase-js'
import type { GameStatus } from '@/types'

/** Safe, non-secret columns exposed by the public /browse list (never host_token). */
export const GAME_BROWSE_FIELDS = 'id, title, game_type, status, max_players, allow_late_players, created_at'

export type BrowseGameRow = {
  id: string
  title: string
  game_type: string
  status: GameStatus
  max_players: number | null
  allow_late_players: boolean | null
  created_at: string
}

export type PublicGame = BrowseGameRow & { playerCount: number }

/** Tally players per game in one query (there is no denormalized count column). */
export async function countPlayersByGame(
  supabase: SupabaseClient,
  gameIds: string[]
): Promise<Record<string, number>> {
  if (gameIds.length === 0) return {}

  const { data: players } = await supabase.from('players').select('game_id').in('game_id', gameIds)

  const counts: Record<string, number> = {}
  for (const id of gameIds) counts[id] = 0
  for (const row of players ?? []) {
    counts[row.game_id as string] = (counts[row.game_id as string] ?? 0) + 1
  }
  return counts
}
