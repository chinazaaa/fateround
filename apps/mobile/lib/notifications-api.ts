import { apiUrl } from '@/lib/config'
import { pushPlatform } from '@/lib/push-notifications'

/**
 * Client wrapper around /api/notifications. Every call carries the device's
 * Expo push token as the identity — there is no account.
 */

export type QuietHoursState = {
  mode: 'off' | 'quiet' | 'available'
  startMinutes: number | null
  endMinutes: number | null
  timezone: string | null
}

export type NotificationsSnapshot = {
  subscribedGameTypes: string[]
  quietHours: QuietHoursState
  countsByGameType: Record<string, number>
}

export async function fetchNotifications(tokenKey: string): Promise<NotificationsSnapshot> {
  const res = await fetch(apiUrl(`/api/notifications?tokenKey=${encodeURIComponent(tokenKey)}`), { cache: 'no-store' })
  if (!res.ok) throw new Error('Failed to load notifications')
  return res.json()
}

export async function subscribeGameType(tokenKey: string, gameType: string, timezone: string | null): Promise<void> {
  const res = await fetch(apiUrl('/api/notifications'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'mobile',
      tokenKey,
      gameType,
      platform: pushPlatform(),
      timezone,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Failed to subscribe')
  }
}

export async function unsubscribeGameType(tokenKey: string, gameType?: string): Promise<void> {
  await fetch(apiUrl('/api/notifications'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenKey, gameType }),
  })
}

export async function patchQuietHours(tokenKey: string, patch: Partial<QuietHoursState>): Promise<void> {
  await fetch(apiUrl('/api/notifications'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenKey, ...patch }),
  })
}
