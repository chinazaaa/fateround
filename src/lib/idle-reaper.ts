import type { SupabaseClient } from '@supabase/supabase-js'
import { adminEndGame, type AdminGameToEnd } from '@/lib/admin-end-game'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isProdDeployment } from '@/lib/app-env'
import { MESSAGE_INBOX_GAME_TYPES, isMessageInboxGame } from '@/lib/game-types'

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
// Backlog-safe defaults: the first tick after this landed on prod tried to
// reap up to 200 games at once every 5 minutes, each running the full
// TypeScript adminEndGame path (room-game points, round-facts snapshot,
// tournament resolution, trophy awards). That saturated the DB and made
// PostgREST/Auth health checks flap. Small batch + longer interval means
// the backlog drains gently; if IDLE_REAPER_DISABLED=1 is set the reaper
// no-ops entirely (kill-switch).
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000 // every 15 minutes
const REAPER_BATCH_LIMIT = 20

/**
 * Kill-switch. Deliberately permissive about how it is spelled: `IDLE_REAPER_DISABLED`
 * is set by a human under pressure through SSM, and an exact `=== '1'` check silently
 * ignores `true` / `yes` / `on` — leaving a destructive sweep running while ops believe
 * they stopped it. Anything non-empty disables the reaper except an explicit
 * `0` / `false` (case-insensitive), which are the only spellings that plausibly mean
 * "leave it on".
 */
export function isIdleReaperDisabled(): boolean {
  const raw = (process.env.IDLE_REAPER_DISABLED ?? '').trim().toLowerCase()
  if (raw === '' || raw === '0' || raw === 'false') return false
  return true
}

export function resolveIdleMinutes(): number {
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
): Promise<{
  closed: number
  failed: number
  raced: number
  errors: string[]
  cleanupFailed: number
  cleanupErrors: string[]
}> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('games')
    .select('id, status, game_type')
    .eq('status', 'active')
    .lt('last_activity_at', cutoff)
    // Message inboxes are never idle in the sense this reaper means. A secret
    // message board is created `status='active'` by design (src/app/api/games/route.ts)
    // and is *meant* to sit there — the host posts an NGL-style link and collects
    // messages for days. Reaping one runs finishSecretMessageBoard →
    // clearAnonymousRoomSessionData, which DELETEs every anonymous_messages and
    // anonymous_room_bans row for that board: the host's whole inbox, gone, because
    // nobody wrote to it for 30 minutes. Excluded server-side so they never eat a
    // batch slot either.
    .not('game_type', 'in', `(${MESSAGE_INBOX_GAME_TYPES.join(',')})`)
    .order('last_activity_at', { ascending: true })
    .limit(REAPER_BATCH_LIMIT)

  if (error) return { closed: 0, failed: 0, raced: 0, errors: [error.message], cleanupFailed: 0, cleanupErrors: [] }

  // Belt and braces: the filter above is the one that matters, but the cost of it
  // being wrong (a typo'd filter string, a new inbox-shaped game type) is a
  // permanently deleted inbox, so re-check every row against the canonical predicate.
  const games: AdminGameToEnd[] = (data ?? []).filter((game: AdminGameToEnd) => !isMessageInboxGame(game.game_type))
  if (games.length === 0) return { closed: 0, failed: 0, raced: 0, errors: [], cleanupFailed: 0, cleanupErrors: [] }

  let closed = 0
  let failed = 0
  // Games another request finished between our SELECT and our UPDATE. Counted
  // separately from both `closed` and `failed`: nothing went wrong (the game IS
  // finished), we simply were not the sweep that finished it — so it is neither our
  // close to claim nor an incident to page on.
  let raced = 0
  const errors: string[] = []
  // Games we DID finish whose post-finish data wipe failed (anonymous-room messages,
  // codewords chat). Tracked apart from `failed` because the close itself succeeded:
  // the row is finished and stamped, only the wipe is outstanding.
  let cleanupFailed = 0
  const cleanupErrors: string[] = []

  for (const game of games) {
    // CAS the active→finished flip. This route has no in-flight guard, so an ops
    // curl overlapping a timer fire (or a manual `systemctl start` during a slow
    // sweep) can select the same batch twice; without the guard both runs award
    // room points and both resolve the tournament match for one game.
    const result = await adminEndGame(supabase, game, { onlyIfActive: true })
    if (result.error) {
      failed += 1
      if (errors.length < 5) errors.push(`${game.id}: ${result.error}`)
      continue
    }
    // Lost the CAS: `error` is null but the row was already `finished`, so the
    // concurrent run owns this game. Counting it as closed would double-report the
    // sweep, and stamping `idle_timeout` would overwrite the real result_reason of a
    // game that another path (a normal finish, an admin end) just completed.
    if (!result.won) {
      raced += 1
      continue
    }
    // We won the transition, so this game is finished — full stop. A failed
    // post-finish cleanup (the anonymous-room / codewords data wipe) must not
    // demote it to a failure: it still counts as closed and still gets stamped
    // below, exactly as a clean close does.
    //
    // KNOWN GAP (deliberately not solved here): a cleanup that fails is not
    // retried. This sweep selects `status='active'` rows only, so once the game
    // is finished no later sweep can revisit it, and there is no durable retry
    // queue. The failure is therefore surfaced — logged here and reported in
    // `cleanupErrors` — so an operator can re-run the wipe by hand. Building a
    // retry queue is a separate change.
    if (result.cleanupError) {
      cleanupFailed += 1
      console.error(
        `[idle-reaper] cleanup after finish failed for game ${game.id} (${game.game_type}) — not retried`,
        result.cleanupError
      )
      if (cleanupErrors.length < 5) cleanupErrors.push(`${game.id}: cleanup failed: ${result.cleanupError}`)
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

  return { closed, failed, raced, errors, cleanupFailed, cleanupErrors }
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
    if (result.closed > 0 || result.failed > 0 || result.raced > 0) {
      console.log(
        `[idle-reaper] closed=${result.closed} failed=${result.failed} raced=${result.raced} cleanupFailed=${result.cleanupFailed} threshold=${minutes}m${
          result.errors.length ? ` errors=${result.errors.join('; ')}` : ''
        }${result.cleanupErrors.length ? ` cleanupErrors=${result.cleanupErrors.join('; ')}` : ''}`
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
  if (isIdleReaperDisabled()) return
  const enabled = isProdDeployment() || process.env.IDLE_REAPER_ENABLED === '1'
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
