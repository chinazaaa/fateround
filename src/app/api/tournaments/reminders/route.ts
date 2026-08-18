import { NextResponse } from 'next/server'
import { dispatchDueTournamentReminders } from '@/lib/tournament-reminders'

/**
 * Scheduled-tournament reminder dispatch. Poked once a minute by the in-process
 * loop in `src/lib/tournament-reminder-ticker.ts`, exactly like the tokenless
 * "system timer" routes the game ticker pokes (`/api/trivia/advance` and
 * friends).
 *
 * Not a cron endpoint — nothing external calls it, and it needs no secret or
 * scheduler. It exists as a ROUTE rather than a direct function call so the
 * `web-push` dependency stays out of `src/instrumentation.ts`, which Next also
 * compiles for the edge runtime (where node's `https` doesn't resolve).
 *
 * Tokenless is safe here because the work is idempotent and self-gating: a
 * reminder is only sent when its `scheduled_at` window is genuinely due, and
 * each one is claimed with a conditional UPDATE that flips `push_sent_*` from
 * null. So a caller hitting this endpoint can, at most, cause a reminder that
 * was already due to fire — once, ever. Nothing to amplify.
 *
 * Force Node: the dispatch path uses web-push, which needs node's `https`.
 */
export const runtime = 'nodejs'

export async function POST() {
  try {
    const dispatched = await dispatchDueTournamentReminders()
    if (dispatched.length > 0) {
      console.log(`[tournament-reminders] sent ${dispatched.length}: ${dispatched.map((d) => d.kind).join(', ')}`)
    }
    return NextResponse.json({ ok: true, dispatched })
  } catch (err) {
    console.error('[tournament-reminders] dispatch failed:', err)
    // 200 with ok:false — the ticker is fire-and-forget and simply retries next
    // minute; a 5xx here would only add noise to error dashboards.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
