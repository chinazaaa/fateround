import type { SupabaseClient } from '@supabase/supabase-js'
import { markGameFinished } from '@/lib/game-finish'
import { calculateTrollRunScore, TROLL_RUN_COUNTDOWN_SECONDS } from '@/lib/troll-run'
import { WORLD_1_LEVELS } from '@/lib/troll-run-engine'
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

  // 1. COUNTDOWN -> RACING
  if (session.phase === 'countdown') {
    const deadlineMs = session.turn_deadline_at ? new Date(session.turn_deadline_at).getTime() : 0
    if (nowMs >= deadlineMs || options?.forceNextRound) {
      const raceDeadline = new Date(nowMs + session.round_time_limit * 1000).toISOString()
      await supabase
        .from('troll_run_sessions')
        .update({
          phase: 'racing',
          round_started_at: now.toISOString(),
          turn_deadline_at: raceDeadline,
          updated_at: now.toISOString(),
        })
        .eq('game_id', gameId)

      return { ok: true, code: 'started_racing', phase: 'racing' }
    }
    return { ok: true, code: 'countdown_active', phase: 'countdown' }
  }

  // 2. RACING -> SCOREBOARD
  if (session.phase === 'racing') {
    const deadlineMs = session.turn_deadline_at ? new Date(session.turn_deadline_at).getTime() : 0
    const timeExpired = deadlineMs > 0 && nowMs >= deadlineMs

    // Check player states
    const { data: playerStates } = await supabase
      .from('troll_run_player_states')
      .select('*')
      .eq('game_id', gameId)
      .eq('current_round', session.current_round)

    const states: TrollRunPlayerState[] = playerStates || []
    const allFinished = states.length > 0 && states.every((s) => s.round_finished)

    if (timeExpired || allFinished || options?.forceNextRound) {
      // For any un-finished player (DNF), calculate their score based on clears & deaths
      for (const s of states) {
        if (!s.round_finished) {
          const dnfScore = calculateTrollRunScore(null, s.levels_cleared, s.deaths, s.total_time_ms)
          await supabase
            .from('troll_run_player_states')
            .update({
              round_finished: true,
              round_score: dnfScore,
              total_score: s.total_score + dnfScore,
              updated_at: now.toISOString(),
            })
            .eq('id', s.id)
        }
      }

      await supabase
        .from('troll_run_sessions')
        .update({
          phase: 'scoreboard',
          turn_deadline_at: null,
          updated_at: now.toISOString(),
        })
        .eq('game_id', gameId)

      return { ok: true, code: 'finished_round', phase: 'scoreboard' }
    }

    return { ok: true, code: 'racing_active', phase: 'racing' }
  }

  // 3. SCOREBOARD -> NEXT ROUND or FINISHED
  if (session.phase === 'scoreboard' && options?.forceNextRound) {
    if (session.current_round < session.total_rounds) {
      const nextRound = session.current_round + 1
      const countdownDeadline = new Date(nowMs + TROLL_RUN_COUNTDOWN_SECONDS * 1000).toISOString()
      const levelOrder = WORLD_1_LEVELS.map((lvl) => lvl.id)

      // Update session
      await supabase
        .from('troll_run_sessions')
        .update({
          phase: 'countdown',
          current_round: nextRound,
          turn_deadline_at: countdownDeadline,
          level_order: levelOrder,
          updated_at: now.toISOString(),
        })
        .eq('game_id', gameId)

      // Fetch distinct players from round 1 to seed round N
      const { data: prevStates } = await supabase
        .from('troll_run_player_states')
        .select('*')
        .eq('game_id', gameId)
        .eq('current_round', session.current_round)

      if (prevStates && prevStates.length > 0) {
        const nextStates = prevStates.map((p) => ({
          game_id: gameId,
          player_id: p.player_id,
          current_round: nextRound,
          current_level_index: 0,
          deaths: 0,
          levels_cleared: 0,
          total_time_ms: 0,
          round_score: 0,
          total_score: p.total_score, // preserve cumulative score!
          finish_position: null,
          round_finished: false,
        }))

        await supabase.from('troll_run_player_states').insert(nextStates)
      }

      return {
        ok: true,
        code: 'advanced_next_round',
        phase: 'countdown',
        currentRound: nextRound,
      }
    } else {
      // Final round completed
      await supabase
        .from('troll_run_sessions')
        .update({
          phase: 'finished',
          updated_at: now.toISOString(),
        })
        .eq('game_id', gameId)

      await markGameFinished(supabase, gameId)
      return { ok: true, code: 'game_finished', phase: 'finished' }
    }
  }

  return { ok: true, code: 'already_done', phase: session.phase }
}
