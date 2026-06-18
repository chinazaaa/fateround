import type { SupabaseClient } from '@supabase/supabase-js'
import { finishAnonymousRoomSession, finishSecretMessageBoard } from '@/lib/anonymous-messages'
import { markGameFinished } from '@/lib/game-finish'
import { isAnonymousMessagesGame, isSecretMessageGame, parseGameType } from '@/lib/game-types'

export type AdminGameToEnd = {
  id: string
  status: string
  game_type: string
}

export function staleGameCutoffIso(olderThanHours: number): string {
  const cutoff = new Date()
  cutoff.setTime(cutoff.getTime() - olderThanHours * 60 * 60 * 1000)
  return cutoff.toISOString()
}

export async function adminEndGame(
  supabase: SupabaseClient,
  game: AdminGameToEnd
): Promise<{ error: string | null }> {
  if (game.status !== 'active' && game.status !== 'waiting') {
    return { error: 'Only waiting or active games can be ended' }
  }

  const gameId = game.id
  const now = new Date().toISOString()

  const { error: roundError } = await supabase
    .from('rounds')
    .update({ status: 'finished', ended_at: now })
    .eq('game_id', gameId)
    .eq('status', 'active')

  if (roundError) return { error: roundError.message }

  const gameType = parseGameType(game.game_type)
  if (isAnonymousMessagesGame(gameType)) {
    return finishAnonymousRoomSession(supabase, gameId)
  }
  if (isSecretMessageGame(gameType)) {
    return finishSecretMessageBoard(supabase, gameId)
  }

  const { error } = await markGameFinished(supabase, gameId, now)
  return { error: error?.message ?? null }
}

export async function countStaleOpenGames(
  supabase: SupabaseClient,
  olderThanHours: number
): Promise<{ count: number; error: string | null }> {
  const cutoff = staleGameCutoffIso(olderThanHours)
  const { count, error } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .in('status', ['waiting', 'active'])
    .lt('created_at', cutoff)

  if (error) return { count: 0, error: error.message }
  return { count: count ?? 0, error: null }
}

export async function fetchStaleOpenGames(
  supabase: SupabaseClient,
  olderThanHours: number
): Promise<{ games: AdminGameToEnd[]; error: string | null }> {
  const cutoff = staleGameCutoffIso(olderThanHours)
  const games: AdminGameToEnd[] = []
  const pageSize = 1000
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('games')
      .select('id, status, game_type')
      .in('status', ['waiting', 'active'])
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) return { games: [], error: error.message }

    const batch = data ?? []
    games.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return { games, error: null }
}

export async function closeStaleOpenGames(
  supabase: SupabaseClient,
  olderThanHours: number
): Promise<{ closed: number; failed: number; errors: string[] }> {
  const { games, error } = await fetchStaleOpenGames(supabase, olderThanHours)
  if (error) return { closed: 0, failed: 0, errors: [error] }

  let closed = 0
  let failed = 0
  const errors: string[] = []

  for (const game of games) {
    const result = await adminEndGame(supabase, game)
    if (result.error) {
      failed += 1
      if (errors.length < 5) {
        errors.push(`${game.id}: ${result.error}`)
      }
    } else {
      closed += 1
    }
  }

  return { closed, failed, errors }
}
