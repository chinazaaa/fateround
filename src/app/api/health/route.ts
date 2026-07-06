import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'

// A monitor must always see live status — never statically render or cache this route.
export const dynamic = 'force-dynamic'

// Stamped into the image at build time (Dockerfile ARG GIT_SHA ← CI github.sha). Lets a
// monitor / a human confirm exactly which build is live. Falls back to 'unknown' locally.
const COMMIT = process.env.GIT_SHA ?? 'unknown'
const DB_TIMEOUT_MS = 2500
const noStore = { 'Cache-Control': 'no-store' }

// Short-lived memo of the deep DB probe. `?deep=1` is unauthenticated (a readiness probe
// conventionally is — the DB up/down bit isn't sensitive, and UptimeRobot's free tier can't
// send a custom auth header). The memo removes the only real concern with that — turning a
// flood of cheap HTTP requests into per-request DB load: the probe runs at most once per
// window. 10s is negligibly stale for a monitor that polls every few minutes.
const DEEP_TTL_MS = 10_000
let deepMemo: { at: number; db: 'ok' | 'unreachable' } | null = null

/**
 * Health check for external uptime monitoring (UptimeRobot etc.).
 *
 * - Default (liveness): 200 `{status:'ok', commit, time}` with no I/O — proves the container
 *   is up and serving. Cheap enough to poll at a tight interval.
 * - `?deep=1` (readiness): additionally confirms Supabase is reachable (timeout-guarded so a
 *   hung DB can't hang the check). Returns 503 `{status:'degraded', db:'unreachable'}` if not,
 *   so a database outage is distinguishable from an app outage on a separate monitor.
 */
export async function GET(req: NextRequest) {
  const deep = new URL(req.url).searchParams.get('deep') === '1'
  const body: Record<string, unknown> = { status: 'ok', commit: COMMIT, time: new Date().toISOString() }

  if (!deep) return NextResponse.json(body, { headers: noStore })

  const db = await checkDb()
  body.db = db
  const ok = db === 'ok'
  if (!ok) body.status = 'degraded'
  return NextResponse.json(body, { status: ok ? 200 : 503, headers: noStore })
}

/** Cheap, timeout-guarded Supabase reachability probe (anon HEAD on a public table), memoized. */
async function checkDb(): Promise<'ok' | 'unreachable'> {
  const now = Date.now()
  if (deepMemo && now - deepMemo.at < DEEP_TTL_MS) return deepMemo.db

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const probe = getSupabaseAnon().from('games').select('id', { head: true }).limit(1)
    const timeout = new Promise<{ error: unknown }>((resolve) => {
      timer = setTimeout(() => resolve({ error: new Error('health db check timed out') }), DB_TIMEOUT_MS)
    })
    const { error } = await Promise.race<{ error: unknown }>([probe, timeout])
    const db = error ? 'unreachable' : 'ok'
    deepMemo = { at: now, db }
    return db
  } catch {
    deepMemo = { at: now, db: 'unreachable' }
    return 'unreachable'
  } finally {
    // Clear the timeout so a fast probe doesn't leave a dangling timer holding the event loop.
    if (timer) clearTimeout(timer)
  }
}
