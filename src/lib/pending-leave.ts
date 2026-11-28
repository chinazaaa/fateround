import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { completePendingRummyRemoval } from '@/lib/rummy'
import {
  isCheckersGame,
  isChessGame,
  isDraughts10Game,
  isRummyGame,
  isWhotGame,
  isWordRushGame,
  parseGameType,
} from '@/lib/game-types'

/**
 * A forfeiting leave commits the finished session (and the games row) BEFORE the leaver's seat is
 * deleted. If that delete then fails, the DELETE players route answered the repeat leave "retained"
 * because the game is finished, so the seat stayed for good. This finishes such a cleanup.
 *
 * Nothing new is stored: every engine's leave claim leaves an unambiguous trace in the session it
 * already writes (see each branch), which never matches a legitimate finisher (a winner, or a loser
 * who resigned / went out and is meant to stay on the results screen). Returns null when nothing is
 * pending, so the caller keeps the finished-game "retained" behaviour.
 */
export type PendingLeaveResult =
  | {
      error: string
      status: number
      /**
       * The seat DELETE was issued before the error: its outcome is uncertain (a delete whose response was lost can
       * have committed). False for an error raised before any delete was attempted (the seat is untouched).
       */
      deleteAttempted: boolean
    }
  | { error: null }

type Failure = { error: string; status: number; deleteAttempted: boolean }

const fail = (scope: string, error: { message?: string }, deleteAttempted = false): Failure => ({
  error: internalErrorMessage(scope, error),
  status: 500,
  deleteAttempted,
})

export async function completePendingFinishedLeave(
  supabase: SupabaseClient,
  gameTypeRaw: string | null | undefined,
  gameId: string,
  playerId: string,
  playerName: string
): Promise<PendingLeaveResult | null> {
  const gameType = parseGameType(gameTypeRaw ?? undefined)

  if (isRummyGame(gameType)) {
    const res = await completePendingRummyRemoval(supabase, gameId, playerId, playerName)
    if (!res) return null
    // Only an error from the seat DELETE itself is uncertain; the session / seat reads and the hand delete fail before it.
    return res.error
      ? { error: res.error, status: res.conflict ? 409 : 500, deleteAttempted: res.seatDeleteIssued === true }
      : { error: null }
  }

  if (isWhotGame(gameType)) return completePendingWhotLeave(supabase, gameId, playerId)

  // Word Rush: a leave that won its own last-round finish while that finish's bookkeeping was still owed kept the seat; the
  // finish recorded the deletion for this exact seat and finish (word_rush_pending_seat_deletions).
  if (isWordRushGame(gameType)) {
    // PENDING-ONLY and decided under the game lock: it needs the finish the record was made for, its completed bookkeeping
    // and the record itself, so a live (reopened) game is never touched.
    const { data, error } = await supabase.rpc('complete_word_rush_pending_seat_deletion', {
      p_game_id: gameId,
      p_player_id: playerId,
    })
    if (error) return fail('word-rush', error, true)
    const status = (data as { status?: string } | null)?.status
    if (status === 'deleted') return { error: null }
    // A deletion IS recorded for this seat, but the finish's bookkeeping is still reading the leaver's rows: not the same as
    // a seat that is simply retained. Retryable, and nothing was attempted.
    if (status === 'bookkeeping_owed') {
      return {
        error: 'Your leave is waiting for the game results to finish saving — try again in a moment',
        status: 409,
        deleteAttempted: false,
      }
    }
    return null
  }

  if (isChessGame(gameType)) {
    return completePendingForfeit(supabase, 'chess_sessions', ['player_white_id', 'player_black_id'], {
      gameId,
      playerId,
      playerName,
      scope: 'chess',
    })
  }
  if (isCheckersGame(gameType)) {
    return completePendingForfeit(supabase, 'checkers_sessions', ['player_red_id', 'player_black_id'], {
      gameId,
      playerId,
      playerName,
      scope: 'checkers',
    })
  }
  if (isDraughts10Game(gameType)) {
    return completePendingForfeit(supabase, 'checkers10_sessions', ['player_red_id', 'player_black_id'], {
      gameId,
      playerId,
      playerName,
      scope: 'draughts10',
    })
  }
  return null
}

/**
 * Whot: a leave removes the player from turn_order and the finish claim keeps everyone who went out
 * (finish_order) in turn_order, so a seated, non-spectating player who is in neither list can only
 * have left. Winners/finishers stay in one of the two lists and keep their rows.
 */
async function completePendingWhotLeave(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string
): Promise<PendingLeaveResult | null> {
  const { data: session, error: sessionError } = await supabase
    .from('whot_sessions')
    .select('turn_order, finish_order')
    .eq('game_id', gameId)
    .maybeSingle()
  if (sessionError) return fail('whot', sessionError)
  if (!session) return null
  const s = session as { turn_order?: string[] | null; finish_order?: string[] | null }
  if ((s.turn_order ?? []).includes(playerId) || (s.finish_order ?? []).includes(playerId)) return null

  const { data: seat, error: seatError } = await supabase
    .from('players')
    .select('id, spectator')
    .eq('id', playerId)
    .eq('game_id', gameId)
    .maybeSingle()
  if (seatError) return fail('whot', seatError)
  if (!seat || (seat as { spectator?: boolean | null }).spectator === true) return null

  const { error: handError } = await supabase
    .from('whot_player_hands')
    .delete()
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  if (handError) return fail('whot', handError)
  const { error } = await supabase.from('players').delete().eq('id', playerId).eq('game_id', gameId)
  return error ? fail('whot', error, true) : { error: null }
}

/**
 * Heads-up engines (chess / checkers / draughts10): the forfeit write is the only place that
 * stores "<name> left — <winner> wins!" as the status message with the leaver as the non-winner.
 * A resignation or a normal result writes a different message, so a loser who resigned keeps
 * their seat on the results screen.
 */
async function completePendingForfeit(
  supabase: SupabaseClient,
  table: string,
  seatColumns: string[],
  ctx: { gameId: string; playerId: string; playerName: string; scope: string }
): Promise<PendingLeaveResult | null> {
  const { data, error: sessionError } = await supabase.from(table).select('*').eq('game_id', ctx.gameId).maybeSingle()
  if (sessionError) return fail(ctx.scope, sessionError)
  const s = data as Record<string, unknown> | null
  if (!s || s.status !== 'finished') return null
  if (!seatColumns.some((col) => s[col] === ctx.playerId)) return null
  if (s.winner_player_id === ctx.playerId || s.is_draw === true) return null
  if (typeof s.status_message !== 'string' || !s.status_message.startsWith(`${ctx.playerName} left — `)) return null

  // The session keeps naming the leaver after the seat is gone, so confirm the seat still exists.
  const { data: seat, error: seatError } = await supabase
    .from('players')
    .select('id')
    .eq('id', ctx.playerId)
    .eq('game_id', ctx.gameId)
    .maybeSingle()
  if (seatError) return fail(ctx.scope, seatError)
  if (!seat) return null

  const { error } = await supabase.from('players').delete().eq('id', ctx.playerId).eq('game_id', ctx.gameId)
  return error ? fail(ctx.scope, error, true) : { error: null }
}
