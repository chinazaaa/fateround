/**
 * Scheduled-tournament reminder ticker — the LOOP only.
 *
 * Deliberately split from `tournament-reminders.ts` (which does the actual
 * dispatch). This module is reached from `src/instrumentation.ts`, and Next
 * compiles the instrumentation hook for the EDGE runtime as well as Node. The
 * dispatch side imports `web-push`, which pulls in node's `https` — unavailable
 * on edge — so having instrumentation reach it, even behind a runtime guard and
 * a dynamic import, breaks the production webpack build with
 * "Module not found: Can't resolve 'https'".
 *
 * Keeping the loop in its own dependency-light module and POKING an HTTP
 * endpoint is the same shape `game-tick.ts` uses, for the same reason: the
 * route keeps all the behaviour, and the ticker stays a plain fetch caller.
 */
import { isProdDeployment } from '@/lib/app-env'

function selfBaseUrl(): string {
  // In `output: 'standalone'` the server listens on PORT (default 3000). Loopback
  // keeps the poke on-box. Shares GAME_TICK_BASE_URL so both in-process loops are
  // redirected together if the server ever binds elsewhere.
  return process.env.GAME_TICK_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`
}

let inFlight = false

async function tick(): Promise<void> {
  if (inFlight) return // never let a slow tick stack on the next
  inFlight = true
  try {
    await fetch(`${selfBaseUrl()}/api/tournaments/reminders`, { method: 'POST' })
  } catch {
    // Swallow — fire-and-forget. A blip self-heals on the next tick, and the
    // dispatch route is idempotent, so nothing is lost by a dropped poke.
  } finally {
    inFlight = false
  }
}

let started = false

/**
 * Starts the reminder interval. Idempotent per process.
 *
 * Mirrors startGameTicker's environment rules so both background loops behave
 * the same way: on by default in production, off in dev/test unless explicitly
 * enabled (otherwise every developer's `next dev` would fire real pushes off
 * the SHARED dev Supabase). Kill-switch: TOURNAMENT_REMINDERS_DISABLED=1.
 *
 * 60s is plenty — the due windows are minutes wide, so a minute of jitter on a
 * "starts in 15 minutes" push is invisible to the recipient.
 */
export function startTournamentReminderTicker(): void {
  if (started) return
  if (process.env.TOURNAMENT_REMINDERS_DISABLED === '1') return
  const enabled = isProdDeployment() || process.env.TOURNAMENT_REMINDERS_ENABLED === '1'
  if (!enabled) return
  started = true
  const intervalMs = Number(process.env.TOURNAMENT_REMINDERS_INTERVAL_MS) || 60_000
  console.log(`[tournament-reminders] ticker started (interval=${intervalMs}ms)`)
  const timer = setInterval(() => {
    void tick()
  }, intervalMs)
  // Don't keep the process alive just for the ticker.
  timer.unref?.()
}
