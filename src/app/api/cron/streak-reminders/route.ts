import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendStreakReminders } from '@/lib/streak-reminders'

/**
 * Daily tick — the come-back nudge for streaks about to lapse
 * (`docs/trophies-and-streaks.md` §4.5).
 *
 * Meant to run ONCE a day, in the evening WAT: late enough that a player who was going to
 * play today probably already has (so we don't nudge people who need no nudge), early enough
 * that there is still time to act on it. 18:00 UTC is 19:00 WAT.
 *
 * Safe to run more often than that — `sendStreakReminders` gates at one push per device per
 * 20 hours — but more often mostly burns queries. Per-device quiet hours are honoured inside,
 * so a player who asked not to be pinged in the evening is dropped rather than queued.
 *
 * Auth: the same `Authorization: Bearer $CRON_SECRET` every cron entrypoint uses.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendStreakReminders(getSupabaseAdmin())
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    // A reminder is best-effort. Never let it 500 into a retry storm.
    console.error('streak reminder tick failed', err)
    return NextResponse.json({ ok: false, sent: 0 }, { status: 200 })
  }
}
