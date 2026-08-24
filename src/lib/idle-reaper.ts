import type { SupabaseClient } from '@supabase/supabase-js'
import { adminEndGame, type AdminGameToEnd } from '@/lib/admin-end-game'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Idle-active-game reaper.
 *
 * The Phase A stale-lobby cron (supabase/migrations/20261001120000_...) closes
 * `status='waiting'` rooms idle for 15 minutes with a pure SQL update. Active
 * games can't take that shortcut — the finish machinery (room-game points,
 * round-facts snapshot, tournament resolution) all lives in the TypeScript
 * `markGameFinished` / `adminEndGame` path — so this reaper does the sweep in
 * process on the same long-running `node server.js` deploy that hosts the
 * game ticker.
 *
 * What "idle" means here: `games.last_activity_at` hasn't advanced in
 * IDLE_HOURS. That column is bumped by any UPDATE on the `games` row
 * (settings edits, host bookkeeping, code rotations, admin actions) via the
 * `games_touch_last_activity` trigger, and by any INSERT/DELETE on `players`
 * via `touch_game_activity_from_players`. It does NOT get bumped by the
 * server ticker poking `expire-turn`/`advance`, because those writes hit
 * sub-tables (ludo_sessions, chess moves, rounds, …) not the games row.
 * That's exactly the signal we want: the ticker keeps forfeiting turns
 * forever after everyone leaves a game, and last_activity_at correctly
 * doesn't tick along with it — so the reaper catches it.
 *
 * Threshold defaults to 30 minutes. Fate Round games are casual/party
 * games — none legitimately runs for that long without someone poking it,
 * and 30m leaves enough slack that a slow real-move game type (whot /
 * chess / ludo — all write to sub-tables not the games row, so their
 * moves don't currently bump last_activity_at) can't get reaped mid-play
 * on a long think. If false-positive reaps become real anyway, the fix
 * is a per-game-type bump in the turn handler. Env override:
 * IDLE_REAPER_MINUTES.
 */

const DEFAULT_IDLE_MINUTES = 30
const MIN_IDLE_MINUTES = 1
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000 // every 5 minutes
const REAPER_BATCH_LIMIT = 200

function resolveIdleMinutes(): number {
  const raw = Number(process.env.IDLE_REAPER_MINUTES)
  if (!Number.isFinite(raw) || raw < MIN_IDLE_MINUTES) return DEFAULT_IDLE_MINUTES
  return Math.floor(raw)
}

/**
 * Find + close active games whose `last_activity_at` is older than the
 * threshold. Marks each with `result_reason='idle_timeout'` so the
 * finished-game view / analytics can tell auto-reaps apart from a normal
 * finish or a manual admin end.
 *
 * Bounded batch — a huge backlog gets chipped away one tick at a time
 * rather than locking hundreds of rows and blocking the finish pipeline
 * for other games. The next tick picks up the rest.
 */
export async function closeIdleActiveGames(
  supabase: SupabaseClient,
  olderThanMinutes: number
): Promise<{ closed: number; failed: number; errors: string[] }> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('games')
    .select('id, status, game_type')
    .eq('status', 'active')
    .lt('last_activity_at', cutoff)
    .order('last_activity_at', { ascending: true })
    .limit(REAPER_BATCH_LIMIT)

  if (error) return { closed: 0, failed: 0, errors: [error.message] }

  const games: AdminGameToEnd[] = data ?? []
  if (games.length === 0) return { closed: 0, failed: 0, errors: [] }

  let closed = 0
  let failed = 0
  const errors: string[] = []

  for (const game of games) {
    const result = await adminEndGame(supabase, game)
    if (result.error) {
      failed += 1
      if (errors.length < 5) errors.push(`${game.id}: ${result.error}`)
      continue
    }
    // Tag the reason after the finish transition landed. Best-effort — if
    // this fails, the game is still correctly finished (matches how the
    // waiting-lobby cron sets it in the same UPDATE); we just lose the
    // analytics label for that one row.
    const { error: reasonError } = await supabase
      .from('games')
      .update({ result_reason: 'idle_timeout' })
      .eq('id', game.id)
    if (reasonError && errors.length < 5) {
      errors.push(`${game.id}: result_reason update failed: ${reasonError.message}`)
    }
    closed += 1
  }

  return { closed, failed, errors }
}

let inFlight = false
let started = false

async function tick(): Promise<void> {
  if (inFlight) return
  inFlight = true
  try {
    const supabase = getSupabaseAdmin()
    const minutes = resolveIdleMinutes()
    const result = await closeIdleActiveGames(supabase, minutes)
    if (result.closed > 0 || result.failed > 0) {
      console.log(
        `[idle-reaper] closed=${result.closed} failed=${result.failed} threshold=${minutes}m${
          result.errors.length ? ` errors=${result.errors.join('; ')}` : ''
        }`
      )
    }
  } catch (err) {
    // Never crash the loop.
    console.error('[idle-reaper] tick failed', err)
  } finally {
    inFlight = false
  }
}

/**
 * Starts the reaper interval. Idempotent per process (a repeated call is a
 * no-op). Matches the game-ticker's dev / prod gating exactly so a
 * developer's `next dev` doesn't reap the shared dev Supabase in parallel
 * with every other dev on the team:
 *
 *   - Production always on (unless IDLE_REAPER_DISABLED=1)
 *   - Dev / test off unless IDLE_REAPER_ENABLED=1
 *
 * Tune cadence with IDLE_REAPER_INTERVAL_MS (default 5 minutes) and the
 * idle threshold with IDLE_REAPER_MINUTES (default 15).
 */
export function startIdleReaper(): void {
  if (started) return
  if (process.env.IDLE_REAPER_DISABLED === '1') return
  const enabled = process.env.NODE_ENV === 'production' || process.env.IDLE_REAPER_ENABLED === '1'
  if (!enabled) return
  started = true
  const intervalMs = Number(process.env.IDLE_REAPER_INTERVAL_MS) || DEFAULT_INTERVAL_MS
  const minutes = resolveIdleMinutes()
  console.log(`[idle-reaper] started (interval=${intervalMs}ms threshold=${minutes}m)`)
  const timer = setInterval(() => {
    void tick()
  }, intervalMs)
  timer.unref?.()
  // First sweep on boot, so a container restart doesn't wait a full
  // interval before reaping games that piled up overnight.
  void tick()
}
