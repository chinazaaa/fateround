import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { finishAnonymousRoomSession, finishSecretMessageBoard } from '@/lib/anonymous-messages'
import { finishCodewordsGame } from '@/lib/codewords'
import { wipeFinishedSession } from '@/lib/session-clear'
import { markGameFinished, type FinishGameResult } from '@/lib/game-finish'
import {
  isAnonymousMessagesGame,
  isCodewordsGame,
  isSecretMessageGame,
  isTwoTruthsGame,
  isWordRushGame,
  parseGameType,
} from '@/lib/game-types'
import { revealFinishedTtlRounds } from '@/lib/two-truths-advance'

export type AdminGameToEnd = {
  id: string
  status: string
  game_type: string
}

export function staleGameCutoffIso(olderThanHours: number): string {
  const cutoff = new Date()
  cutoff.setTime(cutoff.getTime() - olderThanHours * 60 * 60 * 1000)
  return cutoff.toISOString()
}

/**
 * The admin kill-switch: force a waiting or active game to finished.
 *
 * Rounds are bulk-updated to 'finished' WITHOUT going through each game's normal end-of-round
 * path, so anything that path would have written has to be done here too. For Two Truths that is
 * the reveal: `revealFinishedTtlRounds` folds each round's hidden lie and its guesses back into
 * `ttl_metadata`, and this refuses to finish the game if any of that could not be written —
 * because the guard above rejects a game that is already finished, so a failed reveal would be
 * unrecoverable rather than retryable.
 */
export type AdminEndGameOptions = {
  /**
   * Make the active→finished flip a compare-and-set so only one caller runs the
   * award/tournament side effects. Pass it from any path where two requests can
   * pick the same game concurrently — the idle reaper's cron route has no
   * in-flight guard, so an ops curl overlapping a timer fire would otherwise
   * award room points and resolve the tournament match twice for one game.
   * Defaults to false, preserving every existing caller's behaviour.
   */
  onlyIfActive?: boolean
}

/**
 * Bulk-finish a game's active rounds and, for Two Truths, fold each finished round's hidden lie and guesses back
 * into `ttl_metadata` (the bulk update bypasses the normal end-of-round path, so an ended game would otherwise
 * render its last round with no lie highlighted). Idempotent. `startedNoLaterThan` binds it to the rounds of a
 * finished session: Play Again deletes the old rounds and a new session's rounds start after the old
 * `finished_at`, so a late cleanup can never touch a live game's round.
 *
 * The messages are neutral about the game: callers know whether it is still endable and say what to retry.
 */
async function finishGameRounds(
  supabase: SupabaseClient,
  gameId: string,
  gameType: ReturnType<typeof parseGameType>,
  endedAt: string,
  startedNoLaterThan?: string
): Promise<{ error: string | null; superseded?: boolean }> {
  let confirmedRoundIds: string[] | undefined
  if (startedNoLaterThan) {
    // The cleanup of an already FINISHED session: decided in the database, bound to that session under the games row
    // lock (it must still be finished with exactly this finished_at), so a replayed session's live round is never
    // finished by a late cleanup. A timestamp cutoff alone cannot identify the session (the clocks differ).
    const { data, error } = await supabase.rpc('finish_rounds_of_finished_session', {
      p_game_id: gameId,
      p_finished_at: startedNoLaterThan,
    })
    if (error) return { error: internalErrorMessage('admin-end-game', error) }
    // A replayed or missing game has nothing left to clean up for this session (and its new rounds are not ours). A game
    // that is no longer THIS finished session is reported as such (never as success): a caller that is about to delete
    // the session's rows must stop.
    const confirmed = data as { status?: string; round_ids?: string[] } | null
    if (confirmed?.status === 'not_current_session') return { error: null, superseded: true }
    if (confirmed?.status !== 'finished_session') return { error: null }
    confirmedRoundIds = confirmed.round_ids ?? []
  } else {
    const { error } = await supabase
      .from('rounds')
      .update({ status: 'finished', ended_at: endedAt })
      .eq('game_id', gameId)
      .eq('status', 'active')
    if (error) return { error: internalErrorMessage('admin-end-game', error) }
  }
  // For a finished session the database confirmed (under the games row lock) which rounds are its own, so the reveal is
  // limited to exactly those ids: no timestamp cutoff (the clocks differ) and no reaching a replay's rounds.
  if (isTwoTruthsGame(gameType) && !(await revealFinishedTtlRounds(supabase, gameId, undefined, confirmedRoundIds))) {
    return { error: 'Could not reveal every Two Truths round' }
  }
  return { error: null }
}

/**
 * The ONE cleanup of a finished session's leftovers: its rounds (plus the Two Truths reveal), and the per-feature
 * session data that is deleted rather than kept (Codewords chat; Anonymous Messages messages and bans, which the
 * Secret Message Board shares). Everything is bound to `finishedAt`, the `finished_at` the finish wrote, so it is
 * idempotent and can be re-run at any later time without reaching a replayed (Play Again) session's rows, which
 * are all created after it. Runs every step and reports the first failure so a retry can finish the rest.
 */
export async function cleanupFinishedSession(
  supabase: SupabaseClient,
  gameId: string,
  gameType: ReturnType<typeof parseGameType>,
  finishedAt: string
): Promise<string | null> {
  return (await cleanupFinishedSessionOutcome(supabase, gameId, gameType, finishedAt)).error
}

/** {@link cleanupFinishedSession} that also reports a game that is no longer the finished session it was bound to. */
export async function cleanupFinishedSessionOutcome(
  supabase: SupabaseClient,
  gameId: string,
  gameType: ReturnType<typeof parseGameType>,
  finishedAt: string
): Promise<{ error: string | null; superseded?: boolean }> {
  const rounds = await finishGameRounds(supabase, gameId, gameType, finishedAt, finishedAt)
  const roundsError = rounds.error
  let wipeError: string | null = null
  if (isCodewordsGame(gameType)) {
    wipeError = (await wipeFinishedSession(supabase, gameId, finishedAt, 'codewords')).error
  } else if (isAnonymousMessagesGame(gameType) || isSecretMessageGame(gameType)) {
    wipeError = (await wipeFinishedSession(supabase, gameId, finishedAt, 'anonymous')).error
  }
  return { error: roundsError ?? wipeError, ...(rounds.superseded ? { superseded: true } : {}) }
}

/**
 * What a cleanup is bound to, so an OLD leave can never select a LATER finish of the same game id (a replay that ends
 * with `host_ended` again): `finishedAt` is the finish the caller itself observed (from the settlement); `session` is
 * the session identity the leave captured, used when no finish was observed from a database answer.
 */
export type HostLeftCleanupBinding = {
  finishedAt?: string | null
  session?: { startedAt: string | null; sessionsPlayed: number | null }
}

/**
 * Finish the leftovers of a host-left finish (see `end_game_if_host_alone` / `settle_host_leave`). Does nothing unless the game is
 * currently the finished session that was ended by a host leaving, and runs the shared cleanup bound to that
 * session's own `finished_at`, so a Play Again game under the same id (status no longer `finished`) is never
 * touched. Safe to call on every later leave of the retained host seat, and after any finish attempt whose
 * response was lost.
 */
export async function completeHostLeftCleanup(
  supabase: SupabaseClient,
  gameId: string,
  bind: HostLeftCleanupBinding = {}
): Promise<{ finished: boolean; error: string | null; superseded?: boolean }> {
  const { data: game, error } = await supabase
    .from('games')
    .select('status, game_type, result_reason, finished_at, session_started_at, sessions_played')
    .eq('id', gameId)
    .maybeSingle()
  if (error) return { finished: false, error: internalErrorMessage('admin-end-game', error) }
  // `superseded`: the caller named the finish / session it observed and the game is no longer in it.
  if (game?.status !== 'finished') {
    return { finished: false, error: null, ...(bind.finishedAt || bind.session ? { superseded: true } : {}) }
  }
  // Which finish is this? Decided BEFORE anything else about the row (its reason included): a finish the caller did not
  // observe (the game was replayed and finished again since, even for another reason such as an admin end) belongs to a
  // later leave / request, whose own handling covers it. Nothing is cleaned up on behalf of an older one, and a caller
  // that is about to delete this session's rows (Play Again) is told the game moved on.
  if (bind.finishedAt && (!game.finished_at || Date.parse(bind.finishedAt) !== Date.parse(game.finished_at))) {
    return { finished: true, error: null, superseded: true }
  }
  if (
    bind.session &&
    ((game.session_started_at ?? null) !== bind.session.startedAt ||
      (game.sessions_played ?? null) !== bind.session.sessionsPlayed)
  ) {
    return { finished: true, error: null, superseded: true }
  }
  if (game.result_reason !== 'host_ended' || !game.finished_at) return { finished: true, error: null }
  return {
    finished: true,
    ...(await (async () => {
      const outcome = await cleanupFinishedSessionOutcome(
        supabase,
        gameId,
        parseGameType(game.game_type),
        game.finished_at
      )
      return outcome.superseded ? { error: null, superseded: true } : { error: outcome.error }
    })()),
  }
}

export async function adminEndGame(
  supabase: SupabaseClient,
  game: AdminGameToEnd,
  { onlyIfActive = false }: AdminEndGameOptions = {}
): Promise<FinishGameResult> {
  if (game.status !== 'active' && game.status !== 'waiting') {
    return { error: 'Only waiting or active games can be ended', won: false }
  }

  const gameId = game.id
  const now = new Date().toISOString()

  const gameType = parseGameType(game.game_type)
  // Rounds first: a failure here (or a Two Truths reveal that could not be written) leaves the game endable,
  // whereas finishing the game makes this function reject every retry and the round keeps no lie_index forever.
  const roundsError = (await finishGameRounds(supabase, gameId, gameType, now)).error
  if (roundsError) return { error: `${roundsError} — game left endable; retry.`, won: false }
  if (isAnonymousMessagesGame(gameType)) {
    return finishAnonymousRoomSession(supabase, gameId, { onlyIfActive })
  }
  if (isSecretMessageGame(gameType)) {
    return finishSecretMessageBoard(supabase, gameId, { onlyIfActive })
  }
  if (isCodewordsGame(gameType)) {
    return finishCodewordsGame(supabase, gameId, { onlyIfActive })
  }

  // Word Rush's Play Again deletes the rows the post-finish bookkeeping reads, so its bookkeeping is made
  // durable and recoverable (see markGameFinished's `trackBookkeeping`) on this path too.
  const { error, won } = await markGameFinished(supabase, gameId, now, {
    onlyIfActive,
    trackBookkeeping: isWordRushGame(gameType),
  })
  if (error) return { error: internalErrorMessage('admin-end-game', error), won: false }

  // Lost the compare-and-set: another request already finished this game, so it is
  // not ours to label. Stamping anyway would write `admin_ended` over a game someone
  // else finished for a different reason (the `is(null)` guard only helps if the
  // winner already got its own stamp in). Not an error — just nothing left to do.
  if (!won) return { error: null, won: false }

  // Tag the abort reason so the trophy/coin award pass knows to skip counter
  // and streak credit for this finish (src/lib/trophies/award.ts — ABORT_REASONS).
  // Best-effort: the game is already finished; a missing tag only weakens the
  // farming gate for this one row, it doesn't corrupt anything.
  const { error: reasonError } = await supabase
    .from('games')
    .update({ result_reason: 'admin_ended' })
    .eq('id', gameId)
    .is('result_reason', null)
  if (reasonError) console.error(`admin-end-game: result_reason update failed for ${gameId}`, reasonError)
  return { error: null, won: true }
}

export async function countStaleOpenGames(
  supabase: SupabaseClient,
  olderThanHours: number
): Promise<{ count: number; error: string | null }> {
  const cutoff = staleGameCutoffIso(olderThanHours)
  const { count, error } = await supabase
    .from('games')
    .select('id', { count: 'exact', head: true })
    .in('status', ['waiting', 'active'])
    .lt('created_at', cutoff)

  if (error) return { count: 0, error: internalErrorMessage('admin-end-game', error) }
  return { count: count ?? 0, error: null }
}

export async function fetchStaleOpenGames(
  supabase: SupabaseClient,
  olderThanHours: number
): Promise<{ games: AdminGameToEnd[]; error: string | null }> {
  const cutoff = staleGameCutoffIso(olderThanHours)
  const games: AdminGameToEnd[] = []
  const pageSize = 1000
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('games')
      .select('id, status, game_type')
      .in('status', ['waiting', 'active'])
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) return { games: [], error: internalErrorMessage('admin-end-game', error) }

    const batch = data ?? []
    games.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return { games, error: null }
}

export async function closeStaleOpenGames(
  supabase: SupabaseClient,
  olderThanHours: number
): Promise<{ closed: number; failed: number; errors: string[] }> {
  const { games, error } = await fetchStaleOpenGames(supabase, olderThanHours)
  if (error) return { closed: 0, failed: 0, errors: [error] }

  let closed = 0
  let failed = 0
  const errors: string[] = []

  for (const game of games) {
    const result = await adminEndGame(supabase, game)
    if (result.error) {
      failed += 1
      if (errors.length < 5) {
        errors.push(`${game.id}: ${result.error}`)
      }
    } else {
      // A failed post-finish cleanup does not un-close the game, so it counts as
      // closed — but it is not retried anywhere (no later pass revisits a finished
      // game), so log it loudly enough for an operator to clean up by hand.
      if (result.cleanupError) {
        console.error(`close-stale: cleanup after finish failed for ${game.id} — not retried`, result.cleanupError)
      }
      closed += 1
    }
  }

  return { closed, failed, errors }
}
