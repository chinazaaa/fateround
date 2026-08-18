import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { notifyTournamentEvent } from '@/lib/tournament-push'

/**
 * Scheduled-tournament reminder DISPATCH.
 *
 * Sends the "starts in 15 min" and "starting now" pushes for tournaments with a
 * `scheduled_at`. Driven by `POST /api/tournaments/reminders`, which is poked
 * once a minute by the in-process loop in `tournament-reminder-ticker.ts` —
 * the same shape `game-tick.ts` uses. No external cron, no scheduler bill,
 * nothing to configure per environment: the app is deployed as a container
 * running a persistent Node process, so `setInterval` is already a scheduler.
 *
 * The loop lives in a SEPARATE module on purpose. It is reached from
 * `src/instrumentation.ts`, which Next compiles for the edge runtime as well as
 * Node; this file imports `web-push` (→ node's `https`), which edge can't
 * resolve, so pulling it into instrumentation's module graph fails the
 * production build. Keep that split.
 *
 * ── Due-window logic ─────────────────────────────────────────────────────────
 * Deliberately NOT a narrow "target ± n seconds" band. A band has to be tuned
 * against the tick cadence, and silently drops reminders whenever the two drift
 * — a deploy, a restart, or a slow tick straddling the band means the push is
 * never sent at all. Instead each reminder fires on the first tick after its
 * threshold is crossed:
 *
 *   T-15  scheduled_at is within the next 15 min AND still in the future
 *   T-0   scheduled_at has passed, within a grace window
 *
 * So a server that was down over the exact moment still sends on the way back
 * up (slightly late beats never), while the grace window stops it from
 * spamming reminders for events that finished hours ago.
 */

/** How far past start time a "starting now" push is still worth sending. */
const T0_GRACE_MS = 10 * 60_000
const T15_LEAD_MS = 15 * 60_000

type DueRow = { id: string; title: string }

/**
 * Claim one reminder for one tournament, then send it.
 *
 * The claim is a CONDITIONAL update (`.is(column, null)`) that returns the row
 * only if this caller was the one that flipped it from null. That makes the
 * claim atomic: if the app ever runs more than one container, or a slow tick
 * overlaps the next one, exactly one of them wins and the loser sends nothing.
 * A plain read-then-write would let both see null and both send.
 *
 * Claim-before-send means a send that fails is not retried — the alternative
 * (send, then mark) risks sending twice, which is worse for a notification.
 * The .ics alarms baked into the calendar invite are the redundant channel.
 */
async function claimAndSend(
  tournament: DueRow,
  column: 'push_sent_t15_at' | 'push_sent_t0_at',
  event: 'starts_in_15' | 'starts_now',
  body: string
): Promise<boolean> {
  const admin = getSupabaseAdmin()
  const { data: claimed, error } = await admin
    .from('tournaments')
    .update({ [column]: new Date().toISOString() })
    .eq('id', tournament.id)
    .is(column, null)
    .select('id')
    .maybeSingle()

  if (error || !claimed) return false

  await notifyTournamentEvent(tournament.id, event, { body })
  return true
}

/**
 * One pass: find tournaments due a reminder and send it. Exported so it can be
 * driven directly (a test, a one-off script, or an admin "send now" action)
 * without going through the ticker.
 *
 * Returns what it dispatched, for logging.
 */
export async function dispatchDueTournamentReminders(
  now: Date = new Date()
): Promise<Array<{ id: string; kind: 'starts_in_15' | 'starts_now' }>> {
  const admin = getSupabaseAdmin()
  const nowIso = now.toISOString()
  const t15CutoffIso = new Date(now.getTime() + T15_LEAD_MS).toISOString()
  const t0FloorIso = new Date(now.getTime() - T0_GRACE_MS).toISOString()

  const [{ data: due15 }, { data: due0 }] = await Promise.all([
    // Starts within the next 15 minutes and hasn't started yet.
    admin
      .from('tournaments')
      .select('id, title')
      .neq('status', 'finished')
      .not('scheduled_at', 'is', null)
      .gt('scheduled_at', nowIso)
      .lte('scheduled_at', t15CutoffIso)
      .is('push_sent_t15_at', null)
      .limit(200),
    // Start time has passed, but not so long ago that a reminder is noise.
    admin
      .from('tournaments')
      .select('id, title')
      .neq('status', 'finished')
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', nowIso)
      .gte('scheduled_at', t0FloorIso)
      .is('push_sent_t0_at', null)
      .limit(200),
  ])

  const dispatched: Array<{ id: string; kind: 'starts_in_15' | 'starts_now' }> = []

  for (const t of (due15 ?? []) as DueRow[]) {
    const sent = await claimAndSend(
      t,
      'push_sent_t15_at',
      'starts_in_15',
      `${t.title} kicks off in 15 minutes. Tap to open the lobby.`
    )
    if (sent) dispatched.push({ id: t.id, kind: 'starts_in_15' })
  }

  for (const t of (due0 ?? []) as DueRow[]) {
    const sent = await claimAndSend(t, 'push_sent_t0_at', 'starts_now', `${t.title} is starting now — tap to join.`)
    if (sent) dispatched.push({ id: t.id, kind: 'starts_now' })
  }

  return dispatched
}
