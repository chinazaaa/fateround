import { after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Liveness bookkeeping for `games.last_activity_at`.
 *
 * That column is what every "is this game still alive?" check reads —
 * `closeIdleActiveGames` (src/lib/idle-reaper.ts) closes `active` games that
 * have not moved in 30 minutes, and the ticker bounds its discovery query by
 * it. But nothing in actual gameplay wrote it: turn-based games (ludo, chess,
 * whot, scrabble, monopoly, mahjong, checkers, yahtzee, crazy-eights,
 * snake-and-ladder, …) only ever write their own `*_sessions` / board tables,
 * and a message-inbox game only inserts into `anonymous_messages`. Round-based
 * games bumped it purely by accident, because advancing a round writes
 * `games.current_round_number` and the BEFORE UPDATE trigger rides along.
 *
 * So a board game an hour into play looked idle, and reviving the reaper would
 * have closed live games mid-move.
 *
 * The fix has to stay cheap: this whole area exists to REDUCE Supabase traffic,
 * so bumping on every move would be trading one bug for a worse one. Two layers
 * of throttling keep the cost flat:
 *
 *  1. An in-process memo of the last bump per game. A game being played hard
 *     costs ZERO extra DB round trips for the rest of the window.
 *  2. The `touch_game_activity` RPC's own guard
 *     (`last_activity_at < now() - interval`), which is the authority across
 *     server instances and after a restart. It is one statement with no
 *     preceding read, so even a bump that turns out to be unnecessary is a
 *     single UPDATE matching zero rows.
 *
 * Worst case per game: 60 / THROTTLE_MINUTES writes per hour (12/h at 5
 * minutes) regardless of how many moves are played, and in practice one server
 * instance issues at most that many round trips too.
 */

/** Minutes of quiet before a real player action writes `games.last_activity_at` again. */
export const ACTIVITY_THROTTLE_MINUTES = 5

const THROTTLE_MS = ACTIVITY_THROTTLE_MINUTES * 60 * 1000

/**
 * game id -> epoch ms of the last bump we issued from this process. Pruned on
 * write so a long-lived server never accumulates entries for finished games.
 */
const lastTouchedAt = new Map<string, number>()

/** Test seam: forget every remembered bump. */
export function resetGameActivityThrottle(): void {
  lastTouchedAt.clear()
}

function withinThrottleWindow(id: string, now: number): boolean {
  const previous = lastTouchedAt.get(id)
  return previous !== undefined && now - previous < THROTTLE_MS
}

function rememberTouch(id: string, now: number): void {
  // Prune first: entries older than the window can never suppress a bump again.
  for (const [key, at] of lastTouchedAt) {
    if (now - at >= THROTTLE_MS) lastTouchedAt.delete(key)
  }
  lastTouchedAt.set(id, now)
}

/**
 * Issue the guarded bump. Never throws and never rejects — a liveness marker is
 * not worth failing a player's move over. Exported for tests; routes should use
 * `touchGameActivity`.
 */
export async function bumpGameActivity(supabase: SupabaseClient, gameId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('touch_game_activity', {
      p_game_id: gameId,
      p_throttle_minutes: ACTIVITY_THROTTLE_MINUTES,
    })
    if (error) console.error(`touch game activity failed for ${gameId}`, error.message)
  } catch (err) {
    console.error(`touch game activity failed for ${gameId}`, err)
  }
}

/**
 * Mark a game as alive because a real player just acted on it.
 *
 * Fire-and-forget, mirroring `scheduleTurnNotification` in src/lib/push.ts: the
 * work is deferred past the response with `after()` and every failure is
 * swallowed after logging, so a bump can never block or fail the move that
 * triggered it. Outside a request scope (bot drivers, tests, scripts) `after()`
 * throws, so the work is run detached instead.
 *
 * `supabase` must be the service-role client — `games` is not anon-writable.
 */
export function touchGameActivity(supabase: SupabaseClient, gameCode: string): void {
  const id = gameCode.toUpperCase()
  const now = Date.now()
  if (withinThrottleWindow(id, now)) return
  rememberTouch(id, now)

  const run = () => bumpGameActivity(supabase, id)
  try {
    after(run)
  } catch {
    void run()
  }
}
