import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import {
  buildTrollRunLevelOrder,
  buildTrollRunRoundScores,
  TROLL_RUN_COUNTDOWN_SECONDS,
  trollRunRoundParSeconds,
} from '@/lib/troll-run'
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
    const finalStates = await readRoundStates(supabase, gameId, session.current_round)
    const parSeconds = trollRunRoundParSeconds(session.current_world, session.level_order)

    // Written together: the scoreboard waits on the last row, and a serial pass made that wait
    // grow with every extra player in the room.
    await Promise.all(
      buildTrollRunRoundScores(finalStates, parSeconds).map((score) =>
        supabase
          .from('troll_run_player_states')
          .update({
            round_finished: true,
            finish_position: score.finishPosition,
            round_score: score.roundScore,
            total_score: score.totalScore,
            updated_at: nowIso,
          })
          .eq('id', score.stateId)
      )
    )

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
