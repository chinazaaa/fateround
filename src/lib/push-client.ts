/** Browser-side web-push helpers: capability check, SW registration, opt-in flow. */

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  )
}

/** iPhone/iPad — where web push works only from a home-screen-installed PWA (iOS 16.4+). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  // iPadOS 13+ reports itself as "MacIntel"; a touch-capable Mac UA is really an iPad.
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(ua) || iPadOs
}

/** Running as an installed PWA (added to the home screen), not an in-browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/** VAPID public keys are base64url; the browser needs them as a Uint8Array. */
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
 * Full opt-in: request permission, register the SW, create (or reuse) a push
 * subscription, and persist it server-side against this player. Returns true only
 * when the device is subscribed and stored. Resolves false (never throws) if the
 * feature is unconfigured, unsupported, denied, or the network call fails.
 */
export async function subscribeToGamePush(gameCode: string, resumeToken: string): Promise<boolean> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey || !pushSupported()) return false

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

  const res = await fetch(`/api/games/${gameCode}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resumeToken,
      subscription: {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      },
    }),
  })

  return res.ok
}

/**
 * Turn notifications off for this device: drop the server row for this game and tear
 * down the browser subscription. Best-effort — resolves true when the local state is
 * cleared even if the network delete lagged. Never throws.
 */
export async function unsubscribeFromGamePush(gameCode: string): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    const endpoint = subscription?.endpoint

    if (endpoint) {
      await fetch(`/api/games/${gameCode}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      })
    }
    if (subscription) await subscription.unsubscribe()
    return true
  } catch {
    return false
  }
}

/** Whether this device currently holds a push subscription (permission granted + subscribed). */
export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    return Boolean(subscription)
  } catch {
    return false
  }
}
