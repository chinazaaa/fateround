import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'

// A monitor must always see live status — never statically render or cache this route.
export const dynamic = 'force-dynamic'

// Stamped into the image at build time (Dockerfile ARG GIT_SHA ← CI github.sha). Lets a
// monitor / a human confirm exactly which build is live. Falls back to 'unknown' locally.
const COMMIT = process.env.GIT_SHA ?? 'unknown'
const DB_TIMEOUT_MS = 2500
const noStore = { 'Cache-Control': 'no-store' }

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

/** Cheap, timeout-guarded Supabase reachability probe (anon HEAD on a public table). */
async function checkDb(): Promise<'ok' | 'unreachable'> {
  try {
    const probe = getSupabaseAnon().from('games').select('id', { head: true }).limit(1)
    const timeout = new Promise<{ error: unknown }>((resolve) =>
      setTimeout(() => resolve({ error: new Error('health db check timed out') }), DB_TIMEOUT_MS)
    )
    const { error } = await Promise.race<{ error: unknown }>([probe, timeout])
    return error ? 'unreachable' : 'ok'
  } catch {
    return 'unreachable'
  }
}
