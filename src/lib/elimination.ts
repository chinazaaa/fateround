import type { SupabaseClient } from '@supabase/supabase-js'
import type { EliminationConfig } from '@/types/elimination'

export async function getRoundScores(
  supabase: SupabaseClient,
  gameId: string,
  gameType: string,
  roundNumber: number
): Promise<Array<{ playerId: string; score: number }>> {
  const gt = gameType.toLowerCase()

  if (gt === 'trivia') {
    return getTriviaRoundScores(supabase, gameId, roundNumber)
  }
  if (gt === 'npat') {
    return getNpatRoundScores(supabase, gameId, roundNumber)
  }
  if (gt === 'two-truths') {
    return getTwoTruthsRoundScores(supabase, gameId, roundNumber)
  }

  return []
}

async function getTriviaRoundScores(
  supabase: SupabaseClient,
  gameId: string,
  roundNumber: number
): Promise<Array<{ playerId: string; score: number }>> {
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('round_number', roundNumber)
    .maybeSingle()

  if (!round) return []

  const { data: answers } = await supabase.from('trivia_answers').select('player_id, points').eq('round_id', round.id)

  if (!answers?.length) return []

  const totals = new Map<string, number>()
  for (const a of answers) {
    totals.set(a.player_id, (totals.get(a.player_id) ?? 0) + (a.points ?? 0))
  }

  return [...totals.entries()].map(([playerId, score]) => ({ playerId, score })).sort((a, b) => b.score - a.score)
}

async function getNpatRoundScores(
  supabase: SupabaseClient,
  gameId: string,
  roundNumber: number
): Promise<Array<{ playerId: string; score: number }>> {
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('round_number', roundNumber)
    .maybeSingle()

  if (!round) return []

  const { data: answers } = await supabase
    .from('npat_answers')
    .select('player_id, score_name, score_animal, score_place, score_thing, score_food')
    .eq('round_id', round.id)

  if (!answers?.length) return []

  const totals = new Map<string, number>()
  for (const a of answers) {
    const score =
      (a.score_name ?? 0) + (a.score_animal ?? 0) + (a.score_place ?? 0) + (a.score_thing ?? 0) + (a.score_food ?? 0)
    totals.set(a.player_id, (totals.get(a.player_id) ?? 0) + score)
  }

  return [...totals.entries()].map(([playerId, score]) => ({ playerId, score })).sort((a, b) => b.score - a.score)
}

async function getTwoTruthsRoundScores(
  supabase: SupabaseClient,
  gameId: string,
  roundNumber: number
): Promise<Array<{ playerId: string; score: number }>> {
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('game_id', gameId)
    .eq('round_number', roundNumber)
    .maybeSingle()

  if (!round) return []

  const { data: guesses } = await supabase.from('ttl_guesses').select('player_id, is_correct').eq('round_id', round.id)

  if (!guesses?.length) return []

  const totals = new Map<string, number>()
  for (const g of guesses) {
    if (g.is_correct) {
      totals.set(g.player_id, (totals.get(g.player_id) ?? 0) + 1)
    } else {
      if (!totals.has(g.player_id)) totals.set(g.player_id, 0)
    }
  }

  return [...totals.entries()].map(([playerId, score]) => ({ playerId, score })).sort((a, b) => b.score - a.score)
}

export async function applyEliminationRule(
  supabase: SupabaseClient,
  gameId: string,
  gameType: string,
  roundNumber: number,
  config: EliminationConfig
): Promise<{ eliminated: string[]; gameFinished: boolean }> {
  const scores = await getRoundScores(supabase, gameId, gameType, roundNumber)
  if (scores.length === 0) return { eliminated: [], gameFinished: false }

  const { data: activePlayers } = await supabase
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .eq('is_eliminated', false)
    .eq('spectator', false)

  const activeIds = new Set((activePlayers ?? []).map((p) => p.id))
  const activeScores = [...activeIds]
    .map((id) => {
      const found = scores.find((s) => s.playerId === id)
      return { playerId: id, score: found?.score ?? 0 }
    })
    .sort((a, b) => b.score - a.score)

  if (activeScores.length === 0) return { eliminated: [], gameFinished: false }

  let toEliminate: string[] = []

  if (config.mode === 'per-round') {
    if (config.rule === 'bottom-n') {
      toEliminate = findBottomN(activeScores, config.eliminateCount ?? 1)
    } else if (config.rule === 'score-threshold') {
      toEliminate = activeScores.filter((s) => s.score < (config.threshold ?? 0)).map((s) => s.playerId)
    }
  } else if (config.mode === 'lives') {
    toEliminate = findBottomN(activeScores, config.eliminateCount ?? 1)
  }

  if (toEliminate.length >= activeScores.length) {
    return { eliminated: [], gameFinished: true }
  }

  const eliminated: string[] = []
  const now = new Date().toISOString()

  if (config.mode === 'lives') {
    for (const playerId of toEliminate) {
      const { data: player } = await supabase.from('players').select('lives_remaining').eq('id', playerId).maybeSingle()

      const newLives = (player?.lives_remaining ?? 1) - 1

      if (newLives <= 0) {
        await supabase
          .from('players')
          .update({ is_eliminated: true, eliminated_at: now, spectator: true, lives_remaining: 0 })
          .eq('id', playerId)
        eliminated.push(playerId)

        await supabase.from('elimination_events').insert({
          game_id: gameId,
          player_id: playerId,
          round_number: roundNumber,
          reason: 'no-lives',
          eliminated_at: now,
        })
      } else {
        await supabase.from('players').update({ lives_remaining: newLives }).eq('id', playerId)

        await supabase.from('elimination_events').insert({
          game_id: gameId,
          player_id: playerId,
          round_number: roundNumber,
          reason: 'bottom-n',
          eliminated_at: now,
        })
      }
    }
  } else {
    for (const playerId of toEliminate) {
      await supabase
        .from('players')
        .update({ is_eliminated: true, eliminated_at: now, spectator: true })
        .eq('id', playerId)
      eliminated.push(playerId)

      const reason: 'bottom-n' | 'score-threshold' = config.rule === 'score-threshold' ? 'score-threshold' : 'bottom-n'

      await supabase.from('elimination_events').insert({
        game_id: gameId,
        player_id: playerId,
        round_number: roundNumber,
        reason,
        eliminated_at: now,
      })
    }
  }

  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', gameId)
    .eq('is_eliminated', false)
    .eq('spectator', false)

  const gameFinished = (count ?? 0) <= 1

  return { eliminated, gameFinished }
}

function findBottomN(scores: Array<{ playerId: string; score: number }>, n: number): string[] {
  if (scores.length <= 1) return []

  const sorted = [...scores].sort((a, b) => a.score - b.score)

  const cutoffScore = sorted[Math.min(n, sorted.length) - 1].score

  const atCutoff = sorted.filter((s) => s.score === cutoffScore)
  const belowCutoff = sorted.filter((s) => s.score < cutoffScore)

  if (belowCutoff.length >= n) {
    return belowCutoff.slice(0, n).map((s) => s.playerId)
  }

  if (atCutoff.length > 1) {
    return belowCutoff.map((s) => s.playerId)
  }

  return sorted.slice(0, n).map((s) => s.playerId)
}
