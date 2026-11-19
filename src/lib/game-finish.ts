import type { SupabaseClient } from '@supabase/supabase-js'
import { awardRoomGamePoints } from '@/lib/room-points'
import { resolveHeadToHeadMatch } from '@/lib/tournament-h2h'
import { resolveSchoolMatch } from '@/lib/tournament-school'
import { resolveKnockoutGroupRoom } from '@/lib/tournament-scoring'
import { recordRoundFacts } from '@/lib/trophies/round-facts'

/**
 * Result of a finish path that funnels through `markGameFinished`.
 *
 * `won` is the outcome of the active→finished compare-and-set: false means another
 * request had already flipped the row, so this one changed nothing. It is NOT an
 * error (`error` stays null), which is exactly why it has to be reported separately —
 * a caller that only looks at `error` treats a lost race as its own successful finish
 * and goes on to do the winner's bookkeeping a second time.
 *
 * `cleanupError` is deliberately NOT `error` either. Some finish paths run a post-finish
 * data wipe (anonymous-room messages, codewords chat) after the row is already
 * `finished`; that wipe failing does not un-finish the game. Reporting it in
 * `error` made callers treat a completed finish as a failure — the idle reaper
 * counted the game as failed and skipped its `result_reason` stamp, and later
 * sweeps could never revisit it because they select only `status='active'` rows.
 * Completion status lives in `error`/`won`; cleanup status lives here, and is
 * meant to be surfaced (logged / reported), not to gate the finish.
 */
export type FinishGameResult = {
  error: string | null
  won: boolean
  cleanupError?: string | null
  /** Only for `trackBookkeeping` finishes that won the flip: how the post-finish bookkeeping ended. */
  bookkeeping?: FinishBookkeepingState
}

export type RoundGuard = { rpc: string; params: Record<string, unknown> }

/**
 * The post-finish bookkeeping: room points, trophy snapshot and tournament advancement. Every step
 * is idempotent (points are stamped, round facts upsert on (game, player, finished_at), bracket
 * resolution is repeatable), so a caller that owns recovery may safely run it again for a game that
 * is already finished. Normally only the request that won the active→finished transition runs it.
 */
export async function runFinishSideEffects(
  supabase: SupabaseClient,
  gameId: string,
  finishedAt: string
): Promise<{ ok: boolean }> {
  // `ok` is false when any step threw. Untracked callers ignore it (every step stays best-effort for
  // them); tracked finishes use it to retry instead of declaring the bookkeeping done.
  let ok = true
  try {
    await awardRoomGamePoints(supabase, gameId)
  } catch {
    // Room stats are best-effort — never block game finish.
    ok = false
  }
  try {
    // Snapshot trophy facts NOW, while the game's own tables still hold the round. Play-again
    // clears them and Chess's rematch blanks its move list, so deriving these at attribution
    // time — after the client mounts the finished screen — loses them to whoever replays
    // first. Best-effort: on failure the award pass falls back to deriving live, which is
    // exactly the old behaviour.
    await recordRoundFacts(supabase, gameId, finishedAt)
  } catch (err) {
    // Never block game finish for a trophy snapshot — but do NOT swallow the failure silently.
    // The snapshot is the durable copy of a round's facts; if it keeps failing, play-again can
    // delete the live state before attribution and the fallback has nothing to reconstruct
    // from. Logging it means a persistent problem is visible rather than an invisible slow
    // leak of trophies.
    ok = false
    console.error(`recordRoundFacts failed for game ${gameId}`, err)
  }
  try {
    // Advance a head-to-head bracket match (record winner / rematch a draw).
    // No-op for every other game. Never block game finish, but — unlike room
    // points — this is core tournament state, so surface a failure rather than
    // swallow it: a stuck match needs attention (host can re-trigger by ending
    // the game again, and resolution is idempotent).
    await resolveHeadToHeadMatch(supabase, gameId)
  } catch (err) {
    ok = false
    console.error(`resolveHeadToHeadMatch failed for game ${gameId}`, err)
  }
  try {
    // Advance a school (class-ladder) match: climb the winner a class, or finish
    // the tournament if that graduates them. No-op for every other game; core
    // tournament state, so surface a failure rather than swallow it.
    await resolveSchoolMatch(supabase, gameId)
  } catch (err) {
    ok = false
    console.error(`resolveSchoolMatch failed for game ${gameId}`, err)
  }
  try {
    // Score a finished Scrabble knockout room and, once the round's last room is
    // in, cut the bottom half of the whole field. No-op for every other game;
    // core tournament state, so surface a failure rather than swallow it.
    await resolveKnockoutGroupRoom(supabase, gameId)
  } catch (err) {
    ok = false
    console.error(`resolveKnockoutGroupRoom failed for game ${gameId}`, err)
  }
  return { ok }
}

/** A game's post-finish bookkeeping (see `games.finish_bookkeeping`) is leased for this long. */
export const FINISH_BOOKKEEPING_LEASE_SECONDS = 300
/**
 * After this many failed attempts the failure is recorded per game generation in
 * `finish_bookkeeping_failures` and the marker is dropped, so a step that never succeeds cannot block a
 * replay forever (the record survives Play Again and later finishes of the same game id).
 */
export const FINISH_BOOKKEEPING_MAX_ATTEMPTS = 5

/**
 * `none`/`done`: nothing is owed any more (safe to delete the game's source rows).
 * `held`: a live runner owns it. `retry`: it failed and stays owed. `error`: the state could not be read or written.
 */
export type FinishBookkeepingState = 'none' | 'done' | 'held' | 'retry' | 'error'

/**
 * Run a game's owed post-finish bookkeeping under the durable lease in `games.finish_bookkeeping`.
 *
 * The finish that flipped the game set the marker in the same statement, so "finished" and "bookkeeping
 * owed" can never be out of step, and anything that resets the game (Play Again) can tell a runner is
 * still reading its rows. Whoever calls this — the finishing request, Play Again, the cron sweep — claims
 * the lease first, so exactly one runner executes at a time; the steps are idempotent, so a runner that
 * died is simply taken over once its lease expires. The marker is cleared only when every step succeeded
 * (or, after FINISH_BOOKKEEPING_MAX_ATTEMPTS, recorded as failed and dropped), and only by the runner that still owns the lease.
 */
export async function recoverFinishBookkeeping(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ state: FinishBookkeepingState; error?: string }> {
  const owner = crypto.randomUUID()
  const { data: claim, error: claimError } = await supabase.rpc('claim_finish_bookkeeping', {
    p_game_id: gameId,
    p_lease_seconds: FINISH_BOOKKEEPING_LEASE_SECONDS,
    p_owner: owner,
  })
  if (claimError) return { state: 'error', error: claimError.message }
  const status = (claim as { status?: string } | null)?.status
  if (status === 'none') return { state: 'none' }
  if (status !== 'claimed') return { state: 'held' }
  const finishedAt = (claim as { finished_at?: string }).finished_at ?? new Date().toISOString()

  let ok = false
  try {
    ok = (await runFinishSideEffects(supabase, gameId, finishedAt)).ok
  } catch (err) {
    console.error(`finish bookkeeping threw for game ${gameId}`, err)
  }

  if (ok) {
    const { data, error } = await supabase.rpc('complete_finish_bookkeeping', { p_game_id: gameId, p_owner: owner })
    if (error) return { state: 'error', error: error.message }
    // not_owner: our lease expired and another runner took over — it is theirs to complete.
    return { state: data === 'not_owner' ? 'held' : 'done' }
  }
  const { data, error } = await supabase.rpc('fail_finish_bookkeeping', {
    p_game_id: gameId,
    p_owner: owner,
    p_max_attempts: FINISH_BOOKKEEPING_MAX_ATTEMPTS,
  })
  if (error) return { state: 'error', error: error.message }
  if (data === 'gave_up') {
    // Recorded in finish_bookkeeping_failures (per game generation) by the same statement that drops the marker.
    console.error(
      `finish bookkeeping for game ${gameId} gave up after ${FINISH_BOOKKEEPING_MAX_ATTEMPTS} attempts; recorded in finish_bookkeeping_failures`
    )
    return { state: 'done' }
  }
  return { state: data === 'not_owner' ? 'held' : 'retry' }
}

/** Run the sweep over games whose bookkeeping is still owed (the cron tick). */
export async function recoverAllFinishBookkeeping(
  supabase: SupabaseClient,
  limit = 20
): Promise<{ recovered: number; pending: number; failed: number }> {
  const { data, error } = await supabase
    .from('games')
    .select('id')
    .not('finish_bookkeeping', 'is', null)
    .order('finished_at', { ascending: true })
    .limit(limit)
  if (error || !data) return { recovered: 0, pending: 0, failed: error ? 1 : 0 }
  let recovered = 0
  let pending = 0
  let failed = 0
  for (const row of data as Array<{ id: string }>) {
    const res = await recoverFinishBookkeeping(supabase, row.id)
    if (res.state === 'done' || res.state === 'none') recovered += 1
    else if (res.state === 'error') failed += 1
    else pending += 1
  }
  return { recovered, pending, failed }
}

export async function markGameFinished(
  supabase: SupabaseClient,
  gameId: string,
  finishedAt = new Date().toISOString(),
  // Flows where several requests can independently detect the finish at once (e.g.
  // sudoku's "first to solve the whole board") should pass `onlyIfActive` so the
  // active→finished transition is a single-winner CAS — otherwise every racer's
  // update succeeds and `awardRoomGamePoints` runs more than once for one game.
  //
  // `roundGuard` additionally binds the transition to the round whose end the caller observed.
  // `onlyIfActive` cannot tell round A from a round B started under the same game id by Play
  // Again, so a stale finalizer would otherwise finish the new round. It names an RPC that flips
  // games.status only if that round is still the one in the database, in the same statement
  // (called with p_game_id, p_finished_at and `params`; returns true when it flipped the row).
  //
  // `trackBookkeeping` makes the post-finish bookkeeping durable and recoverable: the same statement that
  // flips the game also records `games.finish_bookkeeping`, the bookkeeping then runs under a lease, and
  // the marker is cleared only once every step succeeded (see recoverFinishBookkeeping). Pass it for games
  // whose per-game rows are deleted by a replay while that bookkeeping may still be reading them (Word
  // Rush). With `roundGuard` the named RPC must set the marker itself.
  {
    onlyIfActive = false,
    roundGuard,
    trackBookkeeping = false,
  }: { onlyIfActive?: boolean; roundGuard?: RoundGuard; trackBookkeeping?: boolean } = {}
) {
  let result: { data?: unknown; error: { message: string } | null }
  if (roundGuard) {
    const rpcResult = await supabase.rpc(roundGuard.rpc, {
      p_game_id: gameId,
      p_finished_at: finishedAt,
      ...roundGuard.params,
    })
    result = {
      error: rpcResult.error,
      data: rpcResult.error ? null : rpcResult.data === true ? [{ id: gameId }] : [],
    }
  } else {
    const update = supabase
      .from('games')
      .update({
        status: 'finished',
        finished_at: finishedAt,
        ...(trackBookkeeping ? { finish_bookkeeping: { finished_at: finishedAt, attempts: 0 } } : {}),
      })
      .eq('id', gameId)
    // A tracked flip is always a compare-and-set: an unguarded update would overwrite the marker (and
    // owner) of a finalizer that already finished the game and is mid-bookkeeping, and both would then
    // run it. It still accepts a waiting game (the admin kill-switch may end one).
    result = onlyIfActive
      ? await update.eq('status', 'active').select('id')
      : trackBookkeeping
        ? await update.in('status', ['waiting', 'active']).select('id')
        : await update
  }

  // With the guard, only the request that actually flipped the row (non-empty data)
  // won the transition and should award points; losers get an empty set, no error.
  const won =
    !(onlyIfActive || roundGuard || trackBookkeeping) || (Array.isArray(result.data) && result.data.length > 0)

  let bookkeeping: FinishBookkeepingState | undefined
  if (!result.error && won) {
    if (trackBookkeeping) bookkeeping = (await recoverFinishBookkeeping(supabase, gameId)).state
    else await runFinishSideEffects(supabase, gameId, finishedAt)
  }

  // Surfaced so callers can tell a real finish from a lost CAS: `error` is null in
  // both cases, so without this a racer that changed nothing looks like a success and
  // gets counted/stamped as if it had finished the game. Always true when `onlyIfActive`
  // is not set, which keeps every unguarded caller's behaviour unchanged.
  return { ...result, won, ...(bookkeeping ? { bookkeeping } : {}) }
}
