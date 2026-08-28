import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { finishAnonymousRoomSession, finishSecretMessageBoard } from '@/lib/anonymous-messages'
import { finishCodewordsGame } from '@/lib/codewords'
import { markGameFinished } from '@/lib/game-finish'
import {
  isAnonymousMessagesGame,
  isCodewordsGame,
  isSecretMessageGame,
  isTwoTruthsGame,
  parseGameType,
} from '@/lib/game-types'
import { revealFinishedTtlRounds } from '@/lib/two-truths-advance'

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

export async function adminEndGame(supabase: SupabaseClient, game: AdminGameToEnd): Promise<{ error: string | null }> {
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

  if (roundError) return { error: internalErrorMessage('admin-end-game', roundError) }

  const gameType = parseGameType(game.game_type)
  // The bulk round update above finishes rounds without going through the Two Truths reveal,
  // so fold each finished round's lie back into its metadata — otherwise an admin-ended game
  // renders its last round with no lie highlighted.
  if (isTwoTruthsGame(gameType)) {
    // Bail before the game is marked finished if any reveal could not be written. The rounds are
    // already 'finished' at this point, but revealFinishedTtlRounds picks those up again, so a
    // retry recovers — whereas finishing the game makes this function reject every retry and the
    // round keeps no lie_index forever.
    const revealed = await revealFinishedTtlRounds(supabase, gameId)
    if (!revealed) {
      return { error: 'Could not reveal every Two Truths round — game left endable; retry.' }
    }
  }
  if (isAnonymousMessagesGame(gameType)) {
    return finishAnonymousRoomSession(supabase, gameId)
  }
  if (isSecretMessageGame(gameType)) {
    return finishSecretMessageBoard(supabase, gameId)
  }
  if (isCodewordsGame(gameType)) {
    return finishCodewordsGame(supabase, gameId)
  }

  const { error } = await markGameFinished(supabase, gameId, now)
  if (error) return { error: internalErrorMessage('admin-end-game', error) }

  // Tag the abort reason so the trophy/coin award pass knows to skip counter
  // and streak credit for this finish (src/lib/trophies/award.ts — ABORT_REASONS).
  // Best-effort: the game is already finished; a missing tag only weakens the
  // farming gate for this one row, it doesn't corrupt anything.
  const { error: reasonError } = await supabase
    .from('games')
    .update({ result_reason: 'admin_ended' })
    .eq('id', gameId)
    .is('result_reason', null)
  if (reasonError) console.error(`admin-end-game: result_reason update failed for ${gameId}`, reasonError)
  return { error: null }
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

  if (error) return { count: 0, error: internalErrorMessage('admin-end-game', error) }
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

    if (error) return { games: [], error: internalErrorMessage('admin-end-game', error) }

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
