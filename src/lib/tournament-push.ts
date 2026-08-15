import 'server-only'
import webpush from 'web-push'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Tournament-scoped web-push sender. Parallel to src/lib/push.ts's game
 * sender — same VAPID setup, same stale-endpoint pruning, different table
 * (tournament_push_subscriptions) and payload URL (points at the tournament
 * lobby so tapping the notification opens the right page).
 */

let configured: boolean | null = null

function configureWebPush(): boolean {
  if (configured !== null) return configured
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:hello@fateround.com'
  if (!publicKey || !privateKey) {
    configured = false
    return false
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export type TournamentPushEvent = 'starts_in_15' | 'starts_now' | 'host_started'

type Payload = {
  title: string
  body: string
  event: TournamentPushEvent
  /** Shared with games — sw.js uses this + event as the notification tag so a
   *  second push of the same event coalesces rather than stacking. */
  gameCode: string
  url: string
}

const PAYLOADS: Record<TournamentPushEvent, { title: string; body: string }> = {
  starts_in_15: {
    title: 'Starts in 15 min ⏰',
    body: 'Your tournament kicks off in 15 minutes. Tap to open the lobby.',
  },
  starts_now: {
    title: 'Starting now 🎮',
    body: "Your tournament's start time is here — tap to join.",
  },
  host_started: {
    title: 'The host just started ▶',
    body: 'A game just kicked off — tap to jump in.',
  },
}

/**
 * Fan a push notification out to every subscription registered on this
 * tournament. `titleOverride` / `bodyOverride` let a caller customise the
 * text (e.g. include the tournament title). Prunes 404/410 subscriptions
 * (the browser has revoked/expired them) so the table stays clean.
 */
export async function notifyTournamentEvent(
  tournamentId: string,
  event: TournamentPushEvent,
  overrides?: { title?: string; body?: string }
): Promise<void> {
  if (!configureWebPush()) return
  const admin = getSupabaseAdmin()

  const { data: subs } = await admin
    .from('tournament_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('tournament_id', tournamentId)
  if (!subs || subs.length === 0) return

  const base = PAYLOADS[event]
  const payload: Payload = {
    title: overrides?.title ?? base.title,
    body: overrides?.body ?? base.body,
    event,
    gameCode: tournamentId,
    url: `/tournament/${tournamentId}`,
  }
  const body = JSON.stringify(payload)
  const stale: string[] = []

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) stale.push(s.id)
      }
    })
  )

  if (stale.length > 0) {
    await admin.from('tournament_push_subscriptions').delete().in('id', stale)
  }
}
