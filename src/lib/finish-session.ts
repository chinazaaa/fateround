import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { recoverFinishBookkeeping } from '@/lib/game-finish'

/**
 * Outcome of finishing a round through its transactional database function
 * (`finish_uno_session` / `finish_scrabble_session`).
 *
 * - `won`      this call finished the round (session, hands / scores, series points and the games row, atomically).
 * - `already`  the round was already finished by someone else; the function only completed the games-row flip
 *              (it never re-ranks, re-awards or rewrites). Callers treat it as "the round is over".
 * - neither    the compare-and-swap lost: the session changed since the caller read it and the round is NOT known
 *              to be over (the caller reports `skipped`, which the routes answer with 409).
 * - `error`    the function failed (or rejected the payload): the generic internal error (500).
 */
export type FinishResult = { won: boolean; already?: boolean; error?: string }

/**
 * The round a finish was DECIDED about (an expiry decided from a snapshot): the function compares it with the games
 * row under its lock and answers `lost` for another round (a rematch after the snapshot). Only the keys the caller
 * knows are sent.
 */
export type FinishRound = { sessionStartedAt?: string | null; sessionsPlayed?: number | null }

export function roundPayload(round?: FinishRound): Record<string, unknown> | null {
  if (!round) return null
  return {
    ...(round.sessionStartedAt !== undefined ? { session_started_at: round.sessionStartedAt } : {}),
    ...(round.sessionsPlayed !== undefined ? { sessions_played: round.sessionsPlayed } : {}),
  }
}

type FinishRpcOutcome = { status?: string; games_flipped?: boolean; reason?: string }

/**
 * Call a finish function and map its jsonb outcome. When the call flipped the games row, the durable
 * `finish_bookkeeping` marker it wrote in the same transaction is claimed and the post-finish bookkeeping (room
 * points, round facts, tournament work) runs; a failure there is not a failed finish (the marker is swept later).
 */
export async function callFinishRpc(
  supabase: SupabaseClient,
  rpc: 'finish_uno_session' | 'finish_scrabble_session',
  args: Record<string, unknown>,
  context: 'uno' | 'scrabble',
  gameId: string
): Promise<FinishResult> {
  const { data, error } = await supabase.rpc(rpc, args)
  if (error) return { won: false, error: internalErrorMessage(context, error) }
  const outcome = (data ?? {}) as FinishRpcOutcome
  if (outcome.status === 'lost') return { won: false }
  if (outcome.status !== 'finished' && outcome.status !== 'already_finished') {
    return {
      won: false,
      error: internalErrorMessage(context, `${rpc} rejected the call: ${outcome.reason ?? outcome.status}`),
    }
  }
  if (outcome.games_flipped) {
    const bookkeeping = await recoverFinishBookkeeping(supabase, gameId)
    if (bookkeeping.error) internalErrorMessage(context, bookkeeping.error)
  }
  return outcome.status === 'finished' ? { won: true } : { won: false, already: true }
}
