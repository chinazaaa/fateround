import 'server-only'

type ExpoPushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound?: 'default' | null
}

type ExpoPushTicket = {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/**
 * Send push notifications via the Expo Push API. Best-effort: never throws.
 * Returns token values that Expo reported as unregistered so callers can prune them.
 */
export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<string[]> {
  if (messages.length === 0) return []

  const stale: string[] = []

  // Expo accepts batches of up to 100 messages.
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100)
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      })

      if (!res.ok) continue

      const json = (await res.json()) as { data?: ExpoPushTicket[] }
      const tickets = json.data ?? []
      tickets.forEach((ticket, idx) => {
        if (ticket.status !== 'error') return
        const detail = ticket.details?.error ?? ticket.message
        if (detail === 'DeviceNotRegistered' || detail === 'InvalidCredentials') {
          const token = batch[idx]?.to
          if (token) stale.push(token)
        }
      })
    } catch {
      // silent — push is best-effort
    }
  }

  return stale
}
