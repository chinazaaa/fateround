import type { SupabaseClient } from '@supabase/supabase-js'
import { tallyTriviaPlayerScores } from './trivia'
import type { TriviaAnswer, Player } from '@/types'

export function computePlacementPoints(
  placements: Record<string, number>,
  pointsArray: number[]
): Record<string, number> {
  const fallback = pointsArray[pointsArray.length - 1] ?? 0
  const result: Record<string, number> = {}
  for (const [playerId, rank] of Object.entries(placements)) {
    result[playerId] = pointsArray[rank - 1] ?? fallback
  }
  return result
}

async function computeTriviaPlacements(
  supabase: SupabaseClient,
  gameId: string,
  playerMap: Map<string, string>
): Promise<Record<string, number>> {
  const [answersRes, playersRes] = await Promise.all([
    supabase.from('trivia_answers').select('*').eq('game_id', gameId),
    supabase.from('players').select('*').eq('game_id', gameId),
  ])

  const answers = (answersRes.data ?? []) as TriviaAnswer[]
  const players = (playersRes.data ?? []) as Player[]

  const scores = tallyTriviaPlayerScores(answers, players)

  const placements: Record<string, number> = {}
  let rank = 1
  for (let i = 0; i < scores.length; i++) {
    if (i > 0 && scores[i].score < scores[i - 1].score) {
      rank = i + 1
    }
    const tournamentPlayerId = playerMap.get(scores[i].id)
    if (tournamentPlayerId) {
      placements[tournamentPlayerId] = rank
    }
  }

  return placements
}

export async function awardTournamentPlacements(supabase: SupabaseClient, gameId: string): Promise<void> {
  const { data: game } = await supabase.from('games').select('tournament_id, game_type').eq('id', gameId).maybeSingle()

  if (!game?.tournament_id) return

  const tournamentId = game.tournament_id

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('placement_points')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) return

  const { data: gamePlayers } = await supabase.from('players').select('id, name').eq('game_id', gameId)

  const { data: tournamentPlayers } = await supabase
    .from('tournament_players')
    .select('id, player_name')
    .eq('tournament_id', tournamentId)

  if (!gamePlayers?.length || !tournamentPlayers?.length) {
    await supabase
      .from('tournament_games')
      .update({ status: 'finished', placements: {} })
      .eq('tournament_id', tournamentId)
      .eq('game_id', gameId)
    return
  }

  const playerMap = new Map<string, string>()
  for (const gp of gamePlayers) {
    const tp = tournamentPlayers.find((t) => t.player_name.toLowerCase() === gp.name.toLowerCase())
    if (tp) playerMap.set(gp.id, tp.id)
  }

  let placements: Record<string, number> = {}

  const gameType = game.game_type?.toLowerCase() ?? ''
  if (gameType === 'trivia') {
    placements = await computeTriviaPlacements(supabase, gameId, playerMap)
  }

  if (Object.keys(placements).length === 0) {
    await supabase
      .from('tournament_games')
      .update({ status: 'finished', placements: {} })
      .eq('tournament_id', tournamentId)
      .eq('game_id', gameId)
    return
  }

  const points = computePlacementPoints(placements, tournament.placement_points as number[])

  await supabase
    .from('tournament_games')
    .update({ status: 'finished', placements })
    .eq('tournament_id', tournamentId)
    .eq('game_id', gameId)

  for (const [tpId, earned] of Object.entries(points)) {
    const { error: rpcError } = await supabase.rpc('increment_tournament_points', {
      p_player_id: tpId,
      p_points: earned,
    })
    if (rpcError) {
      console.error('[tournament-scoring] Failed to increment points for player', tpId, rpcError)
    }
  }

  const { data: tournamentState } = await supabase
    .from('tournaments')
    .select('target_game_count')
    .eq('id', tournamentId)
    .maybeSingle()

  if (tournamentState?.target_game_count) {
    const { count } = await supabase
      .from('tournament_games')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId)
      .eq('status', 'finished')

    if (count && count >= tournamentState.target_game_count) {
      await supabase.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)
    }
  }
}
