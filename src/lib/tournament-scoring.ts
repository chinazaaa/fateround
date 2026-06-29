import type { SupabaseClient } from '@supabase/supabase-js'
import { tallyTriviaPlayerScores } from './trivia'
import type { TriviaAnswer, Player } from '@/types'
import type { EliminationConfig } from '@/types/elimination'

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

async function computeNpatPlacements(
  supabase: SupabaseClient,
  gameId: string,
  playerMap: Map<string, string>
): Promise<Record<string, number>> {
  const { data: answers } = await supabase
    .from('npat_answers')
    .select('player_id, score_name, score_animal, score_place, score_thing, score_food')
    .eq('game_id', gameId)

  if (!answers?.length) return {}

  const totals = new Map<string, number>()
  for (const a of answers) {
    const score =
      (a.score_name ?? 0) + (a.score_animal ?? 0) + (a.score_place ?? 0) + (a.score_thing ?? 0) + (a.score_food ?? 0)
    const existing = totals.get(a.player_id) ?? 0
    totals.set(a.player_id, existing + score)
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])

  const placements: Record<string, number> = {}
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][1] < sorted[i - 1][1]) rank = i + 1
    const tournamentPlayerId = playerMap.get(sorted[i][0])
    if (tournamentPlayerId) placements[tournamentPlayerId] = rank
  }
  return placements
}

async function computeTwoTruthsPlacements(
  supabase: SupabaseClient,
  gameId: string,
  playerMap: Map<string, string>
): Promise<Record<string, number>> {
  const { data: guesses } = await supabase.from('ttl_guesses').select('player_id, is_correct').eq('game_id', gameId)

  if (!guesses?.length) return {}

  const totals = new Map<string, number>()
  for (const g of guesses) {
    const existing = totals.get(g.player_id) ?? 0
    totals.set(g.player_id, existing + (g.is_correct ? 1 : 0))
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])

  const placements: Record<string, number> = {}
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i][1] < sorted[i - 1][1]) rank = i + 1
    const tournamentPlayerId = playerMap.get(sorted[i][0])
    if (tournamentPlayerId) placements[tournamentPlayerId] = rank
  }
  return placements
}

export async function awardTournamentPlacements(supabase: SupabaseClient, gameId: string): Promise<void> {
  const { data: game } = await supabase.from('games').select('tournament_id, game_type').eq('id', gameId).maybeSingle()

  if (!game?.tournament_id) return

  const tournamentId = game.tournament_id

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('placement_points, elimination_config')
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
  } else if (gameType === 'npat') {
    placements = await computeNpatPlacements(supabase, gameId, playerMap)
  } else if (gameType === 'two-truths') {
    placements = await computeTwoTruthsPlacements(supabase, gameId, playerMap)
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

  // Claim this game atomically: only the first call to flip it from a non-finished
  // state to 'finished' proceeds with scoring/lives. This is reachable from both the
  // manual finish-game route and the auto-advance path (which players can trigger by
  // polling), so without this guard points/lives could be applied more than once.
  const { data: claimed } = await supabase
    .from('tournament_games')
    .update({ status: 'finished', placements })
    .eq('tournament_id', tournamentId)
    .eq('game_id', gameId)
    .neq('status', 'finished')
    .select('id')

  if (!claimed || claimed.length === 0) return

  for (const [tpId, earned] of Object.entries(points)) {
    const { error: rpcError } = await supabase.rpc('increment_tournament_points', {
      p_player_id: tpId,
      p_points: earned,
    })
    if (rpcError) {
      console.error('[tournament-scoring] Failed to increment points for player', tpId, rpcError)
    }
  }

  // Tournament lives: decrement lives for bottom-N players
  if (tournament.elimination_config) {
    const elimConfig = tournament.elimination_config as EliminationConfig
    if (elimConfig.mode === 'lives') {
      const sortedByPlacement = Object.entries(placements).sort((a, b) => b[1] - a[1])
      const eliminateCount = elimConfig.eliminateCount ?? 1
      const cutoffPlacement = sortedByPlacement[Math.min(eliminateCount, sortedByPlacement.length) - 1]?.[1]
      const belowCutoff = sortedByPlacement.filter(([, p]) => p > cutoffPlacement)
      const atCutoff = sortedByPlacement.filter(([, p]) => p === cutoffPlacement)
      const bottomN =
        belowCutoff.length >= eliminateCount
          ? belowCutoff.slice(0, eliminateCount)
          : atCutoff.length > 1
            ? belowCutoff
            : sortedByPlacement.slice(0, eliminateCount)

      for (const [tpId] of bottomN) {
        const { data: tp } = await supabase
          .from('tournament_players')
          .select('lives_remaining')
          .eq('id', tpId)
          .maybeSingle()

        const newLives = (tp?.lives_remaining ?? 1) - 1

        if (newLives <= 0) {
          await supabase
            .from('tournament_players')
            .update({ is_eliminated: true, eliminated_at: new Date().toISOString(), lives_remaining: 0 })
            .eq('id', tpId)
        } else {
          await supabase.from('tournament_players').update({ lives_remaining: newLives }).eq('id', tpId)
        }
      }

      // Check if only 1 player remains — finish tournament early
      const { count: remaining } = await supabase
        .from('tournament_players')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('is_eliminated', false)

      if (remaining != null && remaining <= 1) {
        await supabase.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)
        return
      }
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
