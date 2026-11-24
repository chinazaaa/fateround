import type { SupabaseClient } from '@supabase/supabase-js'
import { internalErrorMessage } from '@/lib/api-errors'
import { finishAnonymousRoomSession, finishSecretMessageBoard } from '@/lib/anonymous-messages'
import { finishCodewordsGame } from '@/lib/codewords'
import { markGameFinished, type FinishGameResult, type FinishGuard } from '@/lib/game-finish'
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
  /** Single-winner finish over waiting-or-active games, optionally bound to the outgoing host. */
  finishGuard?: FinishGuard
}

const ROUND_CLEANUP_ATTEMPTS = 3

/**
 * Bulk-finish a game's active rounds and, for Two Truths, fold each finished round's lie and guesses back into
 * `ttl_metadata` (the bulk update bypasses the normal end-of-round path). Idempotent. `startedNoLaterThan` binds
 * the update to rounds of a finished session: Play Again deletes the old rounds and a new session's rounds start
 * after the old `finished_at`, so a later retry can never finish a live game's round.
 */
async function finishGameRounds(
  supabase: SupabaseClient,
  gameId: string,
  gameType: ReturnType<typeof parseGameType>,
  endedAt: string,
  startedNoLaterThan?: string
): Promise<string | null> {
  let update = supabase
    .from('rounds')
    .update({ status: 'finished', ended_at: endedAt })
    .eq('game_id', gameId)
    .eq('status', 'active')
  if (startedNoLaterThan) update = update.lte('started_at', startedNoLaterThan)
  const { error: roundError } = await update
  if (roundError) return internalErrorMessage('admin-end-game', roundError)
  // Without this an admin-ended game renders its last round with no lie highlighted. Unguarded callers run it
  // BEFORE the game flip (a failure leaves the game endable); a guarded finish runs it after, and recovers via
  // completeFinishedGameRoundCleanup.
  if (isTwoTruthsGame(gameType)) {
    const revealed = await revealFinishedTtlRounds(supabase, gameId)
    if (!revealed) return 'Could not reveal every Two Truths round — game left endable; retry.'
  }
  return null
}

/**
 * Recovery for a host-left finish whose round cleanup failed after the game was already finished (the guarded
 * order finishes the game first). Callable on a later leave retry: it does nothing unless the game is still the
 * finished session ended by THIS host leaving (`finished`, `host_ended`, host seat still the leaver's), and the
 * round update is bound to rounds started no later than that session's `finished_at`, so a new live game started
 * by Play Again under the same id (status no longer finished, rounds deleted and restarted later) is never touched.
 */
export async function completeFinishedHostLeftRoundCleanup(
  supabase: SupabaseClient,
  gameId: string,
  hostPlayerId: string
): Promise<string | null> {
  const { data: game, error } = await supabase
    .from('games')
    .select('status, game_type, host_player_id, result_reason, finished_at')
    .eq('id', gameId)
    .maybeSingle()
  if (error) return internalErrorMessage('admin-end-game', error)
  if (!game || game.status !== 'finished' || !game.finished_at) return null
  if (game.result_reason !== 'host_ended' || game.host_player_id !== hostPlayerId) return null
  return finishGameRounds(supabase, gameId, parseGameType(game.game_type), game.finished_at, game.finished_at)
}

export async function adminEndGame(
  supabase: SupabaseClient,
  game: AdminGameToEnd,
  { onlyIfActive = false, finishGuard }: AdminEndGameOptions = {}
): Promise<FinishGameResult> {
  if (game.status !== 'active' && game.status !== 'waiting') {
    return { error: 'Only waiting or active games can be ended', won: false }
  }

  const gameId = game.id
  const now = new Date().toISOString()
  const gameType = parseGameType(game.game_type)

  const finishRounds = () => finishGameRounds(supabase, gameId, gameType, now)

  // Unguarded: rounds first, so a failure leaves the game endable for a retry. With a `finishGuard` the
  // guarded games update must decide first — it can lose (another finisher, or a player who claimed host),
  // and a lost finish must not touch the rounds of a game that stays live. The round writes then run only
  // for the winning call; a failure there cannot un-finish the game, so it is reported as `cleanupError`.
  if (!finishGuard) {
    const roundsError = await finishRounds()
    if (roundsError) return { error: roundsError, won: false }
  }
  const result = await finishGame()
  if (finishGuard && result.won && !result.error) {
    // The game is already finished, so a failure here cannot be retried through adminEndGame (it rejects a
    // finished game). Both writes are idempotent, so retry a few times before giving up; the caller can still
    // recover later with `completeFinishedGameRoundCleanup`, bound to this finish.
    let roundsError: string | null = null
    for (let attempt = 0; attempt < ROUND_CLEANUP_ATTEMPTS; attempt++) {
      roundsError = await finishRounds()
      if (!roundsError) break
    }
    if (roundsError) {
      console.error(`admin-end-game: round finish after guarded finish failed for ${gameId}`, roundsError)
      return { ...result, cleanupError: result.cleanupError ?? roundsError }
    }
  }
  return result

  async function finishGame(): Promise<FinishGameResult> {
    if (isAnonymousMessagesGame(gameType)) {
      return finishAnonymousRoomSession(supabase, gameId, { onlyIfActive, finishGuard })
    }
    if (isSecretMessageGame(gameType)) {
      return finishSecretMessageBoard(supabase, gameId, { onlyIfActive, finishGuard })
    }
    if (isCodewordsGame(gameType)) {
      return finishCodewordsGame(supabase, gameId, { onlyIfActive, finishGuard })
    }

    // Word Rush's Play Again deletes the rows the post-finish bookkeeping reads, so its bookkeeping is made
    // durable and recoverable (see markGameFinished's `trackBookkeeping`) on this path too.
    const { error, won } = await markGameFinished(supabase, gameId, now, {
      onlyIfActive,
      finishGuard,
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
