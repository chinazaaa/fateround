import 'server-only'
import webpush from 'web-push'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type PushEvent = 'game_started' | 'lobby_reopened' | 'game_ended'

let configured: boolean | null = null

/**
 * Lazily wire up VAPID from env. Returns false (once) when keys are absent, which
 * makes the whole feature a silent no-op — safe to deploy the code before the keys
 * are set, and safe in local/dev environments that don't have them.
 */
function configure(): boolean {
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

const PAYLOADS: Record<PushEvent, { title: string; body: string }> = {
  game_started: { title: 'Game started 🎮', body: 'The host just kicked things off — jump back in!' },
  lobby_reopened: { title: 'Play again? 🔁', body: 'The lobby reopened for another round — come back in!' },
  game_ended: { title: 'Game over 🏁', body: 'The game just ended — see how it played out.' },
}

/**
 * Send a lifecycle notification to every device subscribed to this game. Best-effort:
 * a failed send never throws to the caller, and endpoints the push service reports as
 * gone (404/410) are pruned so the table doesn't accumulate dead subscriptions.
 */
export async function notifyGameEvent(gameCode: string, event: PushEvent): Promise<void> {
  if (!configure()) return

  const admin = getSupabaseAdmin()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('game_id', gameCode)

  if (!subs || subs.length === 0) return

  const { title, body } = PAYLOADS[event]
  const payload = JSON.stringify({ title, body, event, gameCode, url: `/game/${gameCode}` })

  const stale: string[] = []
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        // 404 Not Found / 410 Gone — the subscription is dead, drop it.
        if (statusCode === 404 || statusCode === 410) stale.push(s.id)
      }
    })
  )

  if (stale.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', stale)
  }
}
