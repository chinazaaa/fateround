import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyGameEvent } from '@/lib/push'

/**
 * Cron tick — send the T-13min "your lobby closes in 2 min" push to the
 * host of any waiting lobby that's been idle long enough. Runs alongside
 * the pure-SQL `close_idle_waiting_lobbies` job (which finishes the game
 * at T-15) so hosts get a warning before the close, not after.
 *
 * Selects games where status='waiting', last_activity_at is older than 13
 * minutes, and `host_idle_warning_sent_at` is still null. Stamps that
 * column BEFORE fanning the push out so a re-fire two minutes later
 * doesn't send a second copy.
 *
 * Auth: same `Authorization: Bearer $CRON_SECRET` all cron entrypoints use.
 */

const WARN_AFTER_MINUTES = 13

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const threshold = new Date(Date.now() - WARN_AFTER_MINUTES * 60 * 1000).toISOString()

  const { data: victims } = await admin
    .from('games')
    .select('id')
    .eq('status', 'waiting')
    .is('host_idle_warning_sent_at', null)
    .lt('last_activity_at', threshold)
    .limit(100)

  const rows = victims ?? []
  if (rows.length === 0) return NextResponse.json({ ok: true, warned: 0 })

  const now = new Date().toISOString()
  let warned = 0
  for (const row of rows) {
    // Stamp first, then push. Guarded on `is null` so a parallel tick or
    // any other writer that already stamped this row makes us skip.
    const { data: stamped } = await admin
      .from('games')
      .update({ host_idle_warning_sent_at: now })
      .eq('id', row.id)
      .is('host_idle_warning_sent_at', null)
      .select('id')
    if (!stamped || stamped.length === 0) continue
    try {
      await notifyGameEvent(row.id, 'host_idle_warning')
      warned += 1
    } catch {
      // Fan-out failure is non-fatal — the DB flag stays set so we don't
      // spam a second push next tick just because one endpoint 500'd.
    }
  }

  return NextResponse.json({ ok: true, warned })
}
