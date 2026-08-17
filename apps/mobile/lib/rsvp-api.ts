import { apiUrl } from '@/lib/config'
import { getExpoPushToken, requestPushPermission, pushPlatform } from '@/lib/push-notifications'

/**
 * Discovery Phase C — mobile RSVP client.
 *
 * RSVP identity is the device's Expo push token. If the user hasn't allowed
 * notifications yet, we prompt them here — the whole point of RSVP is to get
 * the T-15 heads-up push, so a silent RSVP is not useful.
 */

export type UpcomingRsvpRow = {
  id: string
  title: string | null
  game_type: string
  status: string
  scheduled_at: string | null
  is_public: boolean | null
  max_players: number | null
}

async function tokenOrPrompt(): Promise<string | null> {
  const permitted = await requestPushPermission()
  if (!permitted) return null
  return getExpoPushToken()
}

export async function rsvp(gameCode: string): Promise<void> {
  const tokenKey = await tokenOrPrompt()
  if (!tokenKey) throw new Error('Turn notifications on to RSVP — we need a way to remind you.')
  const res = await fetch(apiUrl(`/api/games/${gameCode.toUpperCase()}/rsvp`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'mobile',
      tokenKey,
      platform: pushPlatform(),
      timezone: (() => {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone
        } catch {
          return undefined
        }
      })(),
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Could not RSVP.')
  }
}

export async function unrsvp(gameCode: string): Promise<void> {
  const tokenKey = await getExpoPushToken()
  if (!tokenKey) return
  await fetch(apiUrl(`/api/games/${gameCode.toUpperCase()}/rsvp`), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenKey }),
  })
}

export async function confirmReady(gameCode: string): Promise<void> {
  const tokenKey = await getExpoPushToken()
  if (!tokenKey) throw new Error('Turn notifications on first.')
  const res = await fetch(apiUrl(`/api/games/${gameCode.toUpperCase()}/rsvp/confirm`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenKey }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Could not confirm.')
  }
}

export async function fetchRsvpStatus(gameCode: string): Promise<{
  rsvped: boolean
  confirmed: boolean
  rsvpCount: number
}> {
  const tokenKey = await getExpoPushToken()
  if (!tokenKey) return { rsvped: false, confirmed: false, rsvpCount: 0 }
  const res = await fetch(
    apiUrl(`/api/games/${gameCode.toUpperCase()}/rsvp?tokenKey=${encodeURIComponent(tokenKey)}`),
    { cache: 'no-store' }
  )
  if (!res.ok) return { rsvped: false, confirmed: false, rsvpCount: 0 }
  return res.json()
}

export async function fetchMyUpcoming(): Promise<UpcomingRsvpRow[]> {
  const tokenKey = await getExpoPushToken()
  if (!tokenKey) return []
  const res = await fetch(apiUrl(`/api/rsvps/mine?tokenKey=${encodeURIComponent(tokenKey)}`), { cache: 'no-store' })
  if (!res.ok) return []
  const data = (await res.json()) as { upcoming: UpcomingRsvpRow[] }
  return data.upcoming ?? []
}
