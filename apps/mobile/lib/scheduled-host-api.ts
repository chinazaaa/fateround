import { apiUrl } from '@/lib/config'

/**
 * Client wrappers for Phase C scheduled-game host actions:
 *  - reschedule (with a "Now" preset that inline-transitions to waiting)
 *  - cancel-scheduled (destructive; fires the "cancelled" push to RSVPers)
 *  - transfer-scheduled-host (returns a fresh hostToken for the new host)
 */

export async function reschedule(
  gameCode: string,
  hostToken: string,
  scheduledAtIso: string
): Promise<{ opened: boolean }> {
  const res = await fetch(apiUrl(`/api/games/${gameCode.toUpperCase()}/reschedule`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostToken, scheduled_at: scheduledAtIso }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Could not reschedule.')
  }
  return res.json()
}

export async function cancelScheduled(gameCode: string, hostToken: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/games/${gameCode.toUpperCase()}/cancel-scheduled`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostToken }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Could not cancel.')
  }
}

export async function transferScheduledHost(
  gameCode: string,
  hostToken: string,
  newHostDeviceId: string,
  oldHostName?: string,
  newHostName?: string
): Promise<{ hostToken: string }> {
  const res = await fetch(apiUrl(`/api/games/${gameCode.toUpperCase()}/transfer-scheduled-host`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostToken, newHostDeviceId, oldHostName, newHostName }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Could not transfer host.')
  }
  return res.json()
}
