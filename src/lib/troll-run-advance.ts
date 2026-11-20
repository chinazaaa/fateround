import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import {
  buildTrollRunLevelOrder,
  buildTrollRunRoundScores,
  TROLL_RUN_COUNTDOWN_SECONDS,
  trollRunRoundParSeconds,
} from '@/lib/troll-run'
import type { TrollRunRoundScore } from '@/lib/troll-run'
import type { TrollRunPlayerState, TrollRunSession } from '@/types'

export type TrollRunAdvanceCode =
  | 'countdown_active'
  | 'started_racing'
  | 'racing_active'
  | 'finished_round'
  | 'advanced_next_round'
  | 'game_finished'
  | 'already_done'
  | 'session_not_found'

export interface TrollRunAdvanceResult {
  ok: boolean
  code: TrollRunAdvanceCode
  phase?: string
  currentRound?: number
}

/** Rows per page when recounting a round's death events (PostgREST's default response cap). */
export const TROLL_RUN_DEATH_EVENT_PAGE_SIZE = 1000

async function readRoundStates(
  supabase: SupabaseClient,
  gameId: string,
  round: number
): Promise<TrollRunPlayerState[]> {
  const { data } = await supabase
    .from('troll_run_player_states')
    .select('*')
    .eq('game_id', gameId)
    .eq('current_round', round)

  return (data as TrollRunPlayerState[] | null) ?? []
}

/**
 * The event log is the source of truth for deaths: the per-player total is re-derived from it on
 * every report, but that total write can fail after the event is stored (and a report that loses
 * a race with the final clear is rolled back from both). Scoring therefore recounts the round's
 * death events and uses that count, so a stale row total cannot change a placement or a penalty.
 * If the log cannot be read, the stored totals are used as they are.
 */
export async function reconcileDeathTotals(
  supabase: SupabaseClient,
  gameId: string,
  round: number,
  states: TrollRunPlayerState[],
  pageSize: number = TROLL_RUN_DEATH_EVENT_PAGE_SIZE
): Promise<TrollRunPlayerState[]> {
  if (states.length === 0) return states

  // PostgREST caps one response (1000 rows by default), and a long round with many runners can log
  // more deaths than that: read every page, in a stable order so no row is skipped or repeated.
  const counts = new Map<string, number>()
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('troll_run_events')
      .select('id,player_id')
      .eq('game_id', gameId)
      .eq('round', round)
      .eq('event_type', 'death')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error || !Array.isArray(data)) return states

    for (const row of data as Array<{ player_id: string }>) {
      counts.set(row.player_id, (counts.get(row.player_id) ?? 0) + 1)
    }
    if (data.length < pageSize) break
  }
  const reconciled = states.map((state) => ({ ...state, deaths: counts.get(state.player_id) ?? 0 }))
  // Best-effort repair of the stored totals so the scoreboard shows the same number the score used.
  await Promise.all(
    reconciled
      .filter((state, index) => state.deaths !== states[index].deaths)
      .map((state) => supabase.from('troll_run_player_states').update({ deaths: state.deaths }).eq('id', state.id))
  )
  return reconciled
}

/**
 * Drives the Troll Run phase machine. Every player's client nudges this on its own timer,
 * so each transition is a compare-and-set against the phase (and round) that was read:
 * exactly one caller wins the flip and does the work behind it, and the rest get
 * `already_done` instead of scoring the same round twice or skipping a round.
 */
export async function syncTrollRunGameState(
  supabase: SupabaseClient,
  gameId: string,
  options?: { forceNextRound?: boolean }
): Promise<TrollRunAdvanceResult> {
  const { data: session, error } = await supabase
    .from('troll_run_sessions')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle<TrollRunSession>()

  if (error || !session) {
    return { ok: false, code: 'session_not_found' }
  }

  const now = new Date()
  const nowMs = now.getTime()
  const nowIso = now.toISOString()

  // 1. COUNTDOWN -> RACING
  if (session.phase === 'countdown') {
    const deadlineMs = session.turn_deadline_at ? new Date(session.turn_deadline_at).getTime() : 0
    if (nowMs < deadlineMs && !options?.forceNextRound) {
      return { ok: true, code: 'countdown_active', phase: 'countdown' }
    }

    // The race clock starts from the winning update, so every runner shares one deadline.
    const { data: claimed } = await supabase
      .from('troll_run_sessions')
      .update({
        phase: 'racing',
        round_started_at: nowIso,
        turn_deadline_at: new Date(nowMs + session.round_time_limit * 1000).toISOString(),
        updated_at: nowIso,
      })
      .eq('game_id', gameId)
      .eq('phase', 'countdown')
      .select('id')

    if (!claimed || claimed.length === 0) {
      return { ok: true, code: 'already_done', phase: 'racing' }
    }
    return { ok: true, code: 'started_racing', phase: 'racing' }
  }

  // 2. RACING -> SCOREBOARD
  if (session.phase === 'racing') {
    const deadlineMs = session.turn_deadline_at ? new Date(session.turn_deadline_at).getTime() : 0
    const timeExpired = deadlineMs > 0 && nowMs >= deadlineMs

    const states = await readRoundStates(supabase, gameId, session.current_round)
    const allFinished = states.length > 0 && states.every((state) => state.round_finished)

    if (!timeExpired && !allFinished && !options?.forceNextRound) {
      return { ok: true, code: 'racing_active', phase: 'racing' }
    }

    // Claim the transition before scoring: the winner owns the round's scoring pass, and
    // every other caller returns without touching a score.
    const { data: claimed } = await supabase
      .from('troll_run_sessions')
      .update({ phase: 'scoreboard', turn_deadline_at: null, updated_at: nowIso })
      .eq('game_id', gameId)
      .eq('phase', 'racing')
      .select('id')

    if (!claimed || claimed.length === 0) {
      return { ok: true, code: 'already_done', phase: 'scoreboard' }
    }

    // Re-read after the claim so a finish that landed while the decision was being made is
    // still counted. Anything arriving later is rejected by the finish route's phase check.
    const finalStates = await reconcileDeathTotals(
      supabase,
      gameId,
      session.current_round,
      await readRoundStates(supabase, gameId, session.current_round)
    )
    const parSeconds = trollRunRoundParSeconds(session.current_world, session.level_order)

    const roundScores = buildTrollRunRoundScores(finalStates, parSeconds)

    // Written together: the scoreboard waits on the last row, and a serial pass made that wait
    // grow with every extra player in the room.
    const writeRoundScores = async (scores: TrollRunRoundScore[]): Promise<TrollRunRoundScore[]> => {
      const outcomes = await Promise.all(
        scores.map(async (score) => {
          const { error: scoreError } = await supabase
            .from('troll_run_player_states')
            .update({
              round_finished: true,
              finish_position: score.finishPosition,
              round_score: score.roundScore,
              total_score: score.totalScore,
              updated_at: nowIso,
            })
            .eq('id', score.stateId)

          return scoreError ? score : null
        })
      )

      return outcomes.filter((score): score is TrollRunRoundScore => score !== null)
    }

    let unwritten = await writeRoundScores(roundScores)
    if (unwritten.length > 0) {
      unwritten = await writeRoundScores(unwritten)
    }

    if (unwritten.length > 0) {
      throw new Error(
        `troll run scoring left ${unwritten.length} of ${roundScores.length} players unwritten in game ${gameId} round ${session.current_round}`
      )
    }

    return { ok: true, code: 'finished_round', phase: 'scoreboard' }
  }

  // 3. SCOREBOARD -> NEXT ROUND or FINISHED
  if (session.phase === 'scoreboard' && options?.forceNextRound) {
    if (session.current_round < session.total_rounds) {
      const nextRound = session.current_round + 1

      // Claim the round transition so a double-tap on "next round" cannot skip a round.
      const { data: claimed } = await supabase
        .from('troll_run_sessions')
        .update({
          phase: 'countdown',
          current_round: nextRound,
          round_started_at: null,
          turn_deadline_at: new Date(nowMs + TROLL_RUN_COUNTDOWN_SECONDS * 1000).toISOString(),
          // A fresh shuffle each round, so nobody can rehearse the order between rounds.
          level_order: buildTrollRunLevelOrder(session.current_world),
          updated_at: nowIso,
        })
        .eq('game_id', gameId)
        .eq('phase', 'scoreboard')
        .eq('current_round', session.current_round)
        .select('id')

      if (!claimed || claimed.length === 0) {
        return { ok: true, code: 'already_done', phase: session.phase }
      }

      // Carry every player from the round just played into the new round, keeping their
      // running total. `ignoreDuplicates` makes a retry of this insert a no-op rather than
      // a reset of rows the new round may already have written.
      const prevStates = await readRoundStates(supabase, gameId, session.current_round)
      if (prevStates.length > 0) {
        await supabase.from('troll_run_player_states').upsert(
          prevStates.map((state) => ({
            game_id: gameId,
            player_id: state.player_id,
            current_round: nextRound,
            current_level_index: 0,
            deaths: 0,
            levels_cleared: 0,
            total_time_ms: 0,
            round_score: 0,
            total_score: state.total_score,
            finish_position: null,
            round_finished: false,
          })),
          { onConflict: 'game_id,player_id,current_round', ignoreDuplicates: true }
        )
      }

      return { ok: true, code: 'advanced_next_round', phase: 'countdown', currentRound: nextRound }
    }

    const { data: claimed } = await supabase
      .from('troll_run_sessions')
      .update({ phase: 'finished', turn_deadline_at: null, updated_at: nowIso })
      .eq('game_id', gameId)
      .eq('phase', 'scoreboard')
      .select('id')

    if (claimed && claimed.length > 0) {
      await markGameFinished(supabase, gameId)
    }
    return { ok: true, code: 'game_finished', phase: 'finished' }
  }

  return { ok: true, code: 'already_done', phase: session.phase }
}
