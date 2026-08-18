/**
 * Browser-side subscribe/unsubscribe helpers for tournament push. Reuses the
 * same VAPID key + service worker + capability checks the games flow uses
 * (see push-client.ts) — only the endpoint URLs differ.
 */

import { pushSupported } from './push-client'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    await navigator.serviceWorker.register('/sw.js')
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/**
 * Full opt-in for tournament reminders. `auth` is whichever secret this
 * device holds — a player's tournament resume token or the tournament's
 * host_token; the server accepts both. Returns true only when the browser
 * subscription is created AND saved server-side.
 */
export async function subscribeToTournamentPush(
  tournamentCode: string,
  auth: { resumeToken?: string; hostToken?: string }
): Promise<boolean> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey || !pushSupported()) return false
  if (!auth.resumeToken && !auth.hostToken) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const registration = await registerServiceWorker()
  if (!registration) return false

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) return false

  const res = await fetch(`/api/tournaments/${tournamentCode}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(auth.resumeToken ? { resumeToken: auth.resumeToken } : {}),
      ...(auth.hostToken ? { hostToken: auth.hostToken } : {}),
      subscription: {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
    }),
  })

  return res.ok
}

/**
 * Best-effort teardown: delete the row on the server AND unsubscribe the
 * browser's own PushManager. Keeps the two sides consistent even if one
 * fails. Returns true when the local subscription is cleared.
 */
export async function unsubscribeFromTournamentPush(tournamentCode: string): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    const endpoint = subscription?.endpoint

    if (endpoint) {
      await fetch(`/api/tournaments/${tournamentCode}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
    }
    return true
  } catch {
    return false
  }
}
