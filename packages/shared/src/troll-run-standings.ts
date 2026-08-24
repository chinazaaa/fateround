/**
 * Troll Run — the read-only half of the scoring model.
 *
 * The authoritative scoring (`buildTrollRunRoundScores` and friends) is server-side and stays in
 * `src/lib/troll-run.ts`. What lives here is only what a client needs to draw a scoreboard from
 * rows it has already been handed, which both the web app and the Expo app do. Web re-exports
 * these under their original names, so `@/lib/troll-run` is unchanged from a caller's view.
 */

import type { TrollRunPlayerState, TrollRunSession } from './types'

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
