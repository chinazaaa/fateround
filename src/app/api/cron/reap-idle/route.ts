import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { closeIdleActiveGames, resolveIdleMinutes } from '@/lib/idle-reaper'

/**
 * Cron tick — close `status='active'` games whose `last_activity_at` hasn't
 * moved in 30 minutes (IDLE_REAPER_MINUTES to tune). Bounded batch (20 per
 * call) so a backlog drains gently instead of saturating the DB; the next
 * tick picks up the rest.
 *
 * Why a route and not `startIdleReaper()` in instrumentation.ts: importing
 * the reaper's module graph (admin-end-game → game-finish → room-points /
 * tournament / trophies → coins) during Next's server bootstrap hit a
 * webpack circular-import TDZ and took production down on 2026-08-24 — see
 * the DO-NOT-RE-ADD block in src/instrumentation.ts. A route module is
 * loaded lazily at request time, entirely outside the boot path, so the
 * same graph is safe here (proven by a production build). Without any
 * caller, abandoned games stay 'active' forever and the server ticker pokes
 * them for days (~68.5k Supabase reads/day per zombie).
 *
 * Honors the IDLE_REAPER_DISABLED=1 kill-switch (SSM-plumbed via infra)
 * that guarded the old in-process reaper, so ops can still stop a bad sweep
 * without a deploy.
 *
 * Auth: same `Authorization: Bearer $CRON_SECRET` all cron entrypoints use.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  // Default-deny: an unset CRON_SECRET must close the door, not open it.
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (process.env.IDLE_REAPER_DISABLED === '1') {
    return NextResponse.json({ ok: true, skipped: 'disabled', closed: 0, failed: 0 })
  }

  const minutes = resolveIdleMinutes()
  try {
    const result = await closeIdleActiveGames(getSupabaseAdmin(), minutes)
    if (result.closed > 0 || result.failed > 0 || result.errors.length > 0) {
      console.log(
        `[idle-reaper] closed=${result.closed} failed=${result.failed} threshold=${minutes}m${
          result.errors.length ? ` errors=${result.errors.join('; ')}` : ''
        }`
      )
    }
    return NextResponse.json({ ok: true, threshold_minutes: minutes, ...result })
  } catch (err) {
    // The timer refires in 15 minutes; never 500 into a retry storm.
    console.error('[idle-reaper] cron sweep failed', err)
    return NextResponse.json({ ok: false, closed: 0, failed: 0 }, { status: 200 })
  }
}
