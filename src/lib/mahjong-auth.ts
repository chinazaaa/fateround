// Only ever imported from route handlers. `server-only` says that out loud, because the
// activity bump below reaches `next/server`'s `after()` — an App-Router server API that
// cannot be bundled for the client. Same guard, and same reason, as src/lib/troll-run-guard.ts.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeResumeToken } from '@/lib/utils'
import { touchGameActivity } from '@/lib/game-activity'

type PlayerAuthRow = {
  id: string
  resume_token: string | null
}

export type MahjongAccessOptions = {
  /**
   * Set on paths that only READ. The default is a write path, so a route added later
   * gets the liveness bump for free and only an explicitly read-only one opts out.
   */
  readOnly?: boolean
}

/**
 * Mahjong's authorization chokepoint — the equivalent of `assertPlayer`
 * (src/lib/game-admin.ts) for the mahjong routes, which authorize here instead.
 *
 * Because they never go through `assertPlayer`, they also never picked up the
 * `games.last_activity_at` bump it does, so a mahjong table an hour into a hand still
 * looked idle to `closeIdleActiveGames` (src/lib/idle-reaper.ts) and fell outside the
 * ticker's discovery window. The bump therefore happens here too — same helper, same
 * throttle, no second mechanism.
 *
 * Read paths (`opts.readOnly`) deliberately do NOT bump: liveness must mean a player
 * ACTED, or a tab left polling in a pocket would keep a dead table alive forever. The
 * only read-only caller is `/api/mahjong/state`; claim, discard, draw, pass and riichi
 * are all writes.
 *
 * `supabase` must be the service-role client — `games` is not anon-writable.
 */
export async function verifyMahjongPlayerAccess(
  supabase: SupabaseClient,
  gameId: string,
  playerId: string | null | undefined,
  resumeToken: string | null | undefined,
  opts: MahjongAccessOptions = {}
): Promise<boolean> {
  if (!playerId || !resumeToken?.trim()) return false

  const { data, error } = await supabase
    .from('players')
    .select('id, resume_token')
    .eq('game_id', gameId)
    .eq('id', playerId)
    .maybeSingle()

  if (error || !data) return false
  const row = data as PlayerAuthRow
  if (!row.resume_token) return false

  if (normalizeResumeToken(row.resume_token) !== normalizeResumeToken(resumeToken)) return false

  // Authorized player, write path: the table is alive. Fire-and-forget and throttled to
  // one write per game per ACTIVITY_THROTTLE_MINUTES — see src/lib/game-activity.ts.
  if (!opts.readOnly) touchGameActivity(supabase, gameId)

  return true
}
