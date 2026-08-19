import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrollRunPlayerState, TrollRunSession } from '@/types'
import { assertPlayer } from '@/lib/game-admin'
import { playerIsViewer } from '@/lib/viewers'
import { buildTrollRunRoundDescriptors, resolveTrollRunLevels } from '@/lib/troll-run-engine/levels'
import { internalErrorMessage } from '@/lib/api-errors'
import {
  isTrollRunWorldId,
  TROLL_RUN_DEFAULT_WORLD,
  TROLL_RUN_DEFAULT_ROUNDS,
  TROLL_RUN_DEFAULT_TIME_LIMIT,
  TROLL_RUN_COUNTDOWN_SECONDS,
  type TrollRunWorldId,
} from '@/lib/troll-run-types'
export * from '@/lib/troll-run-types'

export const TROLL_RUN_FINISH_POINTS = [500, 350, 250, 150, 100, 100] as const
export const TROLL_RUN_DEATH_PENALTY = 5
export const TROLL_RUN_PAR_TIME_BONUS = 50
export const TROLL_RUN_MIN_FINISH_SCORE = 10
/** Points a player who ran out of time keeps for each level they did clear. */
export const TROLL_RUN_DNF_LEVEL_POINTS = 10

/** A DNF must never out-score a finisher, so it is capped below the last-place award. */
const TROLL_RUN_DNF_MAX_SCORE = TROLL_RUN_FINISH_POINTS[TROLL_RUN_FINISH_POINTS.length - 1] - TROLL_RUN_DNF_LEVEL_POINTS

export function normalizeTrollRunWorld(world: string | null | undefined): TrollRunWorldId {
  const candidate = typeof world === 'string' ? world.trim().toLowerCase() : ''
  return isTrollRunWorldId(candidate) ? candidate : TROLL_RUN_DEFAULT_WORLD
}

/**
 * Fresh level sequence for one round of the given world.
 *
 * The seed is rolled here and stored with the round, which is what makes each game different: the
 * descriptors it produces rebuild the same ten levels on every client, and the next round rolls again.
 */
export function buildTrollRunLevelOrder(world: string | null | undefined): string[] {
  return buildTrollRunRoundDescriptors(normalizeTrollRunWorld(world), Math.floor(Math.random() * 0x100000000))
}

/** Summed par time of the levels in a round, used for the clean-run speed bonus. */
export function trollRunRoundParSeconds(world: string | null | undefined, levelOrder: string[]): number {
  // No order means no levels to be fast across, and a zero total switches the bonus off entirely.
  if (!Array.isArray(levelOrder) || levelOrder.length === 0) return 0

  return resolveTrollRunLevels(levelOrder, normalizeTrollRunWorld(world)).reduce(
    (total, level) => total + level.parTime,
    0
  )
}

/** Score for a player who cleared every level in the round. */
export function calculateTrollRunFinishScore(
  placement: number,
  deaths: number,
  totalTimeMs: number,
  parTimeTotalSec: number
): number {
  const placeIndex = Math.min(Math.max(placement, 1) - 1, TROLL_RUN_FINISH_POINTS.length - 1)
  const placePoints = TROLL_RUN_FINISH_POINTS[placeIndex] ?? TROLL_RUN_FINISH_POINTS[TROLL_RUN_FINISH_POINTS.length - 1]
  const deathPenalty = deaths * TROLL_RUN_DEATH_PENALTY
  const speedBonus = parTimeTotalSec > 0 && totalTimeMs / 1000 <= parTimeTotalSec ? TROLL_RUN_PAR_TIME_BONUS : 0

  return Math.max(TROLL_RUN_MIN_FINISH_SCORE, placePoints + speedBonus - deathPenalty)
}

/** Score for a player who ran out of time part-way through the round. */
export function calculateTrollRunDnfScore(levelsCleared: number | null | undefined, deaths: number): number {
  const cleared = Math.max(0, levelsCleared ?? 0)
  const basePoints = cleared * TROLL_RUN_DNF_LEVEL_POINTS
  const deathPenalty = deaths * TROLL_RUN_DEATH_PENALTY
  return Math.max(0, Math.min(TROLL_RUN_DNF_MAX_SCORE, basePoints - deathPenalty))
}

export interface TrollRunRoundScore {
  stateId: string
  playerId: string
  finishPosition: number | null
  roundScore: number
  totalScore: number
}

/**
 * Final scores for one round, computed in a single pass so placement is decided by the
 * race itself rather than by whichever "I finished" request reached the server first:
 * finishers rank by elapsed time (ties to fewer deaths), everyone still running when the
 * clock expired keeps partial credit for the levels they did clear.
 */
export function buildTrollRunRoundScores(
  playerStates: TrollRunPlayerState[],
  parTimeTotalSec: number
): TrollRunRoundScore[] {
  const finishers = playerStates
    .filter((state) => state.round_finished)
    .sort((first, second) => {
      if (first.total_time_ms !== second.total_time_ms) return first.total_time_ms - second.total_time_ms
      return first.deaths - second.deaths
    })

  const scores: TrollRunRoundScore[] = finishers.map((state, index) => {
    const placement = index + 1
    const roundScore = calculateTrollRunFinishScore(placement, state.deaths, state.total_time_ms, parTimeTotalSec)
    return {
      stateId: state.id,
      playerId: state.player_id,
      finishPosition: placement,
      roundScore,
      totalScore: state.total_score + roundScore,
    }
  })

  for (const state of playerStates) {
    if (state.round_finished) continue
    const roundScore = calculateTrollRunDnfScore(state.levels_cleared, state.deaths)
    scores.push({
      stateId: state.id,
      playerId: state.player_id,
      finishPosition: null,
      roundScore,
      totalScore: state.total_score + roundScore,
    })
  }

  return scores
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
  const world = normalizeTrollRunWorld(options?.world)

  const levelOrder = buildTrollRunLevelOrder(world)

  // Clear any existing session/state rows before initializing to prevent unique constraint conflicts
  await supabase.from('troll_run_events').delete().eq('game_id', gameId)
  await supabase.from('troll_run_player_states').delete().eq('game_id', gameId)
  await supabase.from('troll_run_sessions').delete().eq('game_id', gameId)

  // Start the first round straight away — the countdown phase is what players see when
  // the host presses start, and /api/troll-run/advance flips it to racing on deadline.
  const now = new Date()
  const countdownDeadline = new Date(now.getTime() + TROLL_RUN_COUNTDOWN_SECONDS * 1000).toISOString()

  const { error: sessionError } = await supabase.from('troll_run_sessions').insert({
    game_id: gameId,
    phase: 'countdown',
    current_round: 1,
    total_rounds: totalRounds,
    current_world: world,
    levels_per_round: levelOrder.length,
    round_time_limit: timeLimit,
    turn_deadline_at: countdownDeadline,
    level_order: levelOrder,
  })

  if (sessionError) return { error: internalErrorMessage('troll_run', sessionError) }

  // Seed player states
  const playerStates = playerIds.map((playerId) => ({
    game_id: gameId,
    player_id: playerId,
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
  const [eventsResult, statesResult, sessionResult] = await Promise.all([
    supabase.from('troll_run_events').delete().eq('game_id', gameId),
    supabase.from('troll_run_player_states').delete().eq('game_id', gameId),
    supabase.from('troll_run_sessions').delete().eq('game_id', gameId),
  ])

  const failure = eventsResult.error ?? statesResult.error ?? sessionResult.error
  if (failure) return { error: internalErrorMessage('troll_run:clear', failure) }

  return { error: null }
}

/**
 * Ends a Troll Run match immediately, scoring any in-progress round so players receive
 * their partial-credit or finish points for levels cleared before ending.
 */
export async function finishTrollRunGameEarly(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ error: string | null }> {
  const { data: session } = await supabase
    .from('troll_run_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle<TrollRunSession>()

  if (!session) return { error: null }

  const nowIso = new Date().toISOString()

  // If the race was active, score the in-progress round so cleared levels award points
  if (session.phase === 'racing' || session.phase === 'countdown') {
    const { data: states } = await supabase
      .from('troll_run_player_states')
      .select('*')
      .eq('game_id', gameId)
      .eq('current_round', session.current_round)

    const playerStates = (states as TrollRunPlayerState[] | null) ?? []
    const parSeconds = trollRunRoundParSeconds(session.current_world, session.level_order)

    for (const score of buildTrollRunRoundScores(playerStates, parSeconds)) {
      await supabase
        .from('troll_run_player_states')
        .update({
          round_finished: true,
          finish_position: score.finishPosition,
          round_score: score.roundScore,
          total_score: score.totalScore,
          updated_at: nowIso,
        })
        .eq('id', score.stateId)
    }
  }

  await supabase.from('troll_run_sessions').update({ phase: 'finished', updated_at: nowIso }).eq('game_id', gameId)

  return { error: null }
}

export type TrollRunRacingGuard =
  | { ok: false; error: string; status: 400 | 403 | 404 }
  | { ok: true; session: TrollRunSession; state: TrollRunPlayerState }

/**
 * Shared authorization + phase guard for the three in-race report routes.
 *
 * Each route is called from the game loop many times a round, so the checks live here
 * once: the caller is authorized by its secret resume_token (never by a client-supplied
 * player id), viewers are refused, the room really is a Troll Run room that is racing, and
 * the player's row for the current round exists. Callers act only on the returned row.
 */
export async function assertTrollRunRacingPlayer(
  supabase: SupabaseClient,
  gameId: string,
  resumeToken: string
): Promise<TrollRunRacingGuard> {
  const { data: game } = await supabase
    .from('games')
    .select('id,status,game_type,session_started_at')
    .eq('id', gameId)
    .maybeSingle()

  if (!game) return { ok: false, error: 'Game not found', status: 404 }
  if (game.game_type !== 'troll_run') return { ok: false, error: 'Not a Troll Run game', status: 400 }
  if (game.status !== 'active') return { ok: false, error: 'Game is not active', status: 400 }

  const auth = await assertPlayer(supabase, gameId, resumeToken)
  if (auth.error || !auth.player) return { ok: false, error: auth.error ?? 'Unauthorized', status: 403 }
  if (playerIsViewer(auth.player, game)) {
    return { ok: false, error: 'Viewers cannot race', status: 403 }
  }

  const { data: session } = await supabase
    .from('troll_run_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle<TrollRunSession>()

  if (!session) return { ok: false, error: 'Race not found', status: 404 }
  if (session.phase !== 'racing') return { ok: false, error: 'The round is not running', status: 400 }

  const { data: state } = await supabase
    .from('troll_run_player_states')
    .select('*')
    .eq('game_id', gameId)
    .eq('player_id', auth.player.id)
    .eq('current_round', session.current_round)
    .maybeSingle<TrollRunPlayerState>()

  if (!state) return { ok: false, error: 'You are not in this round', status: 404 }

  return { ok: true, session, state }
}

/**
 * Race time elapsed at this moment, capped at the round limit so a late report can never
 * beat a genuinely faster run and a missing `round_started_at` cannot produce a negative.
 */
export function trollRunElapsedMs(session: Pick<TrollRunSession, 'round_started_at' | 'round_time_limit'>): number {
  if (!session.round_started_at) return 0
  const elapsed = Date.now() - new Date(session.round_started_at).getTime()
  return Math.max(0, Math.min(session.round_time_limit * 1000, Math.round(elapsed)))
}

/**
 * How many levels the round in progress contains. The order drawn at round start is what the
 * players actually run, so it wins over the room setting it was drawn from.
 */
export function trollRunRoundLevelCount(session: Pick<TrollRunSession, 'level_order' | 'levels_per_round'>): number {
  return session.level_order.length > 0 ? session.level_order.length : session.levels_per_round
}

/** Rows for a single round — player state tables keep one row per player per round. */
export function selectTrollRunRoundStates(
  playerStates: TrollRunPlayerState[],
  round: number | null | undefined
): TrollRunPlayerState[] {
  if (!round) return playerStates
  return playerStates.filter((state) => state.current_round === round)
}

export function buildTrollRunStandings(playerStates: TrollRunPlayerState[], playerNames: Map<string, string>) {
  const seen = new Set<string>()
  const deduped: TrollRunPlayerState[] = []
  for (const state of playerStates) {
    if (!state.player_id || seen.has(state.player_id)) continue
    seen.add(state.player_id)
    deduped.push(state)
  }

  return deduped
    .sort((first, second) => {
      // Sort by total score descending
      if (second.total_score !== first.total_score) return second.total_score - first.total_score
      // Tiebreak 1: fewer deaths
      if (first.deaths !== second.deaths) return first.deaths - second.deaths
      // Tiebreak 2: faster time
      return first.total_time_ms - second.total_time_ms
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

export interface TrollRunChampionshipStanding {
  rank: number
  playerId: string
  name: string
  totalScore: number
  totalLevelsCleared: number
  totalDeaths: number
  roundsFinishedCount: number
  totalTimeMs: number
}

/**
 * Aggregates all rounds to produce accurate cumulative championship standings.
 */
export function buildTrollRunChampionshipStandings(
  allPlayerStates: TrollRunPlayerState[],
  playerNames: Map<string, string>
): TrollRunChampionshipStanding[] {
  const byPlayer = new Map<
    string,
    {
      playerId: string
      totalScore: number
      totalLevelsCleared: number
      totalDeaths: number
      roundsFinishedCount: number
      totalTimeMs: number
    }
  >()

  for (const state of allPlayerStates) {
    const existing = byPlayer.get(state.player_id) ?? {
      playerId: state.player_id,
      totalScore: 0,
      totalLevelsCleared: 0,
      totalDeaths: 0,
      roundsFinishedCount: 0,
      totalTimeMs: 0,
    }

    existing.totalScore = Math.max(existing.totalScore, state.total_score)
    existing.totalLevelsCleared += state.levels_cleared ?? 0
    existing.totalDeaths += state.deaths ?? 0
    if (state.round_finished) existing.roundsFinishedCount += 1
    existing.totalTimeMs += state.total_time_ms ?? 0

    byPlayer.set(state.player_id, existing)
  }

  return [...byPlayer.values()]
    .sort((first, second) => {
      if (second.totalScore !== first.totalScore) return second.totalScore - first.totalScore
      if (first.totalDeaths !== second.totalDeaths) return first.totalDeaths - second.totalDeaths
      return first.totalTimeMs - second.totalTimeMs
    })
    .map((summary, index) => ({
      rank: index + 1,
      playerId: summary.playerId,
      name: playerNames.get(summary.playerId) ?? 'Player',
      totalScore: summary.totalScore,
      totalLevelsCleared: summary.totalLevelsCleared,
      totalDeaths: summary.totalDeaths,
      roundsFinishedCount: summary.roundsFinishedCount,
      totalTimeMs: summary.totalTimeMs,
    }))
}
