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
export type FinishGameResult = { error: string | null; won: boolean; cleanupError?: string | null }

export type RoundGuard = { rpc: string; params: Record<string, unknown> }

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
  {
    onlyIfActive = false,
    roundGuard,
    onlySessionStartedAt,
  }: {
    onlyIfActive?: boolean
    roundGuard?: RoundGuard
    // Bind the finish to the session whose state the caller inspected (requires onlyIfActive,
    // plain-update path only). A stalled request must not finish a NEW session started under
    // the same game id by Play Again; `null` matches only a row whose session_started_at is
    // still null.
    onlySessionStartedAt?: string | null
  } = {}
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
    const update = supabase.from('games').update({ status: 'finished', finished_at: finishedAt }).eq('id', gameId)
    let guarded = onlyIfActive ? update.eq('status', 'active') : null
    if (guarded && onlySessionStartedAt !== undefined) {
      guarded =
        onlySessionStartedAt === null
          ? guarded.is('session_started_at', null)
          : guarded.eq('session_started_at', onlySessionStartedAt)
    }
    result = guarded ? await guarded.select('id') : await update
  }

  // With the guard, only the request that actually flipped the row (non-empty data)
  // won the transition and should award points; losers get an empty set, no error.
  const won = !(onlyIfActive || roundGuard) || (Array.isArray(result.data) && result.data.length > 0)

  if (!result.error && won) {
    try {
      await awardRoomGamePoints(supabase, gameId)
    } catch {
      // Room stats are best-effort — never block game finish.
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
      console.error(`resolveHeadToHeadMatch failed for game ${gameId}`, err)
    }
    try {
      // Advance a school (class-ladder) match: climb the winner a class, or finish
      // the tournament if that graduates them. No-op for every other game; core
      // tournament state, so surface a failure rather than swallow it.
      await resolveSchoolMatch(supabase, gameId)
    } catch (err) {
      console.error(`resolveSchoolMatch failed for game ${gameId}`, err)
    }
    try {
      // Score a finished Scrabble knockout room and, once the round's last room is
      // in, cut the bottom half of the whole field. No-op for every other game;
      // core tournament state, so surface a failure rather than swallow it.
      await resolveKnockoutGroupRoom(supabase, gameId)
    } catch (err) {
      console.error(`resolveKnockoutGroupRoom failed for game ${gameId}`, err)
    }
  }

  // Surfaced so callers can tell a real finish from a lost CAS: `error` is null in
  // both cases, so without this a racer that changed nothing looks like a success and
  // gets counted/stamped as if it had finished the game. Always true when `onlyIfActive`
  // is not set, which keeps every unguarded caller's behaviour unchanged.
  return { ...result, won }
}
