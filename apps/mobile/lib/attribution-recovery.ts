import { apiUrl } from '@/lib/config'
import { authHeaders, ensureServerIdentity } from '@/lib/identity'
import { getDeviceId } from '@/lib/coins/device-id'
import { emitCoinsAwarded, emitGuestCoinsPending } from '@/lib/coins/earn-events'
import { getPlayerGameCodes, getPlayerSession } from '@/lib/secure-session'

/**
 * Recovery sweep for missed trophy attributions.
 *
 * `useProfileAttribution` runs on the finished screen. If the player leaves before the game's
 * `status` flips to `finished` (Word Search timer, others still playing, tab closed), attribution
 * never posts and the game earns no trophies. This sweep walks every game code this device holds
 * a player row for and idempotently retries `/api/profile/attribute`, so the next app open — or
 * any later visit — catches up.
 *
 * Best-effort throughout. Every failure path is a silent skip: the pending games stay pending
 * for the next sweep to pick up. Nothing here may surface an error.
 */

// In-memory guard so remounts in the same session don't hammer the endpoint.
// Cleared implicitly by app kill/restart — the next launch tries again.
const attemptedThisSession = new Set<string>()

export async function recoverPendingAttributions(): Promise<void> {
  try {
    const codes = await getPlayerGameCodes()
    if (codes.length === 0) return

    // Only claim an identity if we actually need one — no signed-in profile means guest
    // pending grants are the best we can do, and even that only runs where the game had a
    // finished session ready to snapshot.
    const profileId = await ensureServerIdentity()
    const deviceId = await getDeviceId()
    const headers = profileId ? await authHeaders() : null

    for (const code of codes) {
      if (attemptedThisSession.has(code)) continue
      attemptedThisSession.add(code)

      const session = await getPlayerSession(code)
      if (!session?.resumeToken) continue

      try {
        const res = await fetch(apiUrl('/api/profile/attribute'), {
          method: 'POST',
          headers: headers ?? { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameCode: code, resumeToken: session.resumeToken, deviceId: deviceId ?? undefined }),
        })
        if (!res.ok) {
          attemptedThisSession.delete(code)
          continue
        }
        const body = (await res.json().catch(() => null)) as {
          coins?: { total: number; lines: unknown[] }
          guestCoins?: { total: number; lines: unknown[] }
          gameType?: string
        } | null
        // Emit awards so any listener (results panel, notification bell) picks them up.
        if (body?.coins) emitCoinsAwarded(body.coins, code, body.gameType)
        if (body?.guestCoins) emitGuestCoinsPending(body.guestCoins, code)
      } catch {
        // Transport failure — leave this code eligible for the next sweep.
        attemptedThisSession.delete(code)
      }
    }
  } catch {
    // silent
  }
}
