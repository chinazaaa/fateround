import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrollRunPhase, TrollRunPlayerState, TrollRunSession } from '@/types'
import { WORLD_1_LEVELS } from '@/lib/troll-run-engine'
import { internalErrorMessage } from '@/lib/api-errors'

export const TROLL_RUN_MIN_PLAYERS = 2
export const TROLL_RUN_MAX_PLAYERS = 8
export const TROLL_RUN_DEFAULT_MAX_PLAYERS = 6
export const TROLL_RUN_COUNTDOWN_SECONDS = 3
export const TROLL_RUN_DEFAULT_ROUNDS = 5
export const TROLL_RUN_DEFAULT_TIME_LIMIT = 120 // 2 minutes per round
export const TROLL_RUN_LEVELS_PER_ROUND = 10

export const TROLL_RUN_FINISH_POINTS = [500, 350, 250, 150, 100, 100, 100, 100] as const
export const TROLL_RUN_DEATH_PENALTY = 5
export const TROLL_RUN_PAR_TIME_BONUS = 50

export function calculateTrollRunScore(
  placement: number | null,
  levelsCleared: number,
  deaths: number,
  totalTimeMs: number,
  parTimeTotalSec = 50
): number {
  if (placement === null || placement < 1) {
    // DNF — only base points for levels cleared
    const basePts = levelsCleared * 20
    const deathPenalty = deaths * TROLL_RUN_DEATH_PENALTY
    return Math.max(0, basePts - deathPenalty)
  }

  const placeIdx = Math.min(placement - 1, TROLL_RUN_FINISH_POINTS.length - 1)
  const placePts = TROLL_RUN_FINISH_POINTS[placeIdx] ?? 100
  const deathPenalty = deaths * TROLL_RUN_DEATH_PENALTY
  const speedBonus = totalTimeMs / 1000 <= parTimeTotalSec ? TROLL_RUN_PAR_TIME_BONUS : 0

  return Math.max(10, placePts + speedBonus - deathPenalty)
}

export async function initializeTrollRunGame(
  supabase: SupabaseClient,
  gameId: string,
  playerIds: string[],
  options?: {
    totalRounds?: number
    timeLimitSeconds?: number
    world?: string
  }
): Promise<{ error: string | null }> {
  const totalRounds = options?.totalRounds ?? TROLL_RUN_DEFAULT_ROUNDS
  const timeLimit = options?.timeLimitSeconds ?? TROLL_RUN_DEFAULT_TIME_LIMIT
  const world = options?.world ?? 'pits'

  // Pick level order for round 1
  const levelOrder = WORLD_1_LEVELS.map((lvl) => lvl.id)

  const { error: sessionError } = await supabase.from('troll_run_sessions').insert({
    game_id: gameId,
    phase: 'lobby',
    current_round: 1,
    total_rounds: totalRounds,
    current_world: world,
    levels_per_round: levelOrder.length,
    round_time_limit: timeLimit,
    level_order: levelOrder,
  })

  if (sessionError) return { error: internalErrorMessage('troll_run', sessionError) }

  // Seed player states
  const playerStates = playerIds.map((pid) => ({
    game_id: gameId,
    player_id: pid,
    current_round: 1,
    current_level_index: 0,
    deaths: 0,
    levels_cleared: 0,
    total_time_ms: 0,
    round_score: 0,
    total_score: 0,
    finish_position: null,
    round_finished: false,
  }))

  const { error: playersError } = await supabase.from('troll_run_player_states').insert(playerStates)
  if (playersError) return { error: internalErrorMessage('troll_run', playersError) }

  return { error: null }
}

export async function clearTrollRunSessionData(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  await Promise.all([
    supabase.from('troll_run_events').delete().eq('game_id', gameId),
    supabase.from('troll_run_player_states').delete().eq('game_id', gameId),
    supabase.from('troll_run_sessions').delete().eq('game_id', gameId),
  ])
  return { error: null }
}

export function buildTrollRunStandings(playerStates: TrollRunPlayerState[], playerNames: Map<string, string>) {
  return [...playerStates]
    .sort((a, b) => {
      // Sort by total score descending
      if (b.total_score !== a.total_score) return b.total_score - a.total_score
      // Tiebreak 1: fewer deaths
      if (a.deaths !== b.deaths) return a.deaths - b.deaths
      // Tiebreak 2: faster time
      return a.total_time_ms - b.total_time_ms
    })
    .map((state, index) => ({
      rank: index + 1,
      playerId: state.player_id,
      name: playerNames.get(state.player_id) ?? 'Player',
      totalScore: state.total_score,
      roundScore: state.round_score,
      levelsCleared: state.levels_cleared,
      deaths: state.deaths,
      finishPosition: state.finish_position,
      roundFinished: state.round_finished,
    }))
}
