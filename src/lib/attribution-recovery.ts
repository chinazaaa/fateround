'use client'

import { authHeaders, ensureServerIdentity } from '@/lib/identity'
import { getDeviceId } from '@/lib/coins/device-id'
import { emitCoinsAwarded, emitGuestCoinsPending } from '@/lib/coins/earn-events'
import { emitTrophiesEarned } from '@/lib/trophies/earned-events'
import { getPlayerSession } from '@/lib/utils'

/**
 * Recovery sweep for missed trophy attributions.
 *
 * `useProfileAttribution` runs on the finished screen. If the player left before the game's
 * `status` flipped to `finished` (Word Search timer, others still playing, tab closed), attribution
 * never posted and the game earned no trophies. This sweep walks every game code this browser
 * still holds a player row for and idempotently retries `/api/profile/attribute`, so the next
 * profile visit — or app load — catches up.
 *
 * Best-effort. Every failure path is a silent skip: the pending games stay pending for the next
 * sweep to pick up. Nothing here surfaces an error, since it runs against past games that have
 * already gone one way or another.
 */

const PLAYER_KEY_PREFIX = 'kmk_player_'

// Per-tab guard so remounts don't hammer the endpoint. Cleared on tab close;
// a fresh tab tries again.
const attemptedThisSession = new Set<string>()

/** Every game code this browser has a persisted player session for. */
function listPlayerGameCodes(): string[] {
  if (typeof window === 'undefined') return []
  const out: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(PLAYER_KEY_PREFIX)) out.push(key.slice(PLAYER_KEY_PREFIX.length))
    }
  } catch {
    // Access blocked (private mode, storage disabled) — nothing to recover.
  }
  return out
}

export async function recoverPendingAttributions(): Promise<void> {
  const codes = listPlayerGameCodes()
  if (codes.length === 0) return

  try {
    const profileId = await ensureServerIdentity()
    const deviceId = getDeviceId()
    const headers = profileId ? await authHeaders() : null

    for (const code of codes) {
      if (attemptedThisSession.has(code)) continue
      attemptedThisSession.add(code)

      const session = getPlayerSession(code)
      if (!session?.resumeToken) continue

      try {
        const res = await fetch('/api/profile/attribute', {
          method: 'POST',
          headers: headers ?? { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameCode: code, resumeToken: session.resumeToken, deviceId: deviceId ?? undefined }),
        })
        if (!res.ok) {
          attemptedThisSession.delete(code)
          continue
        }
        const body = (await res.json().catch(() => null)) as {
          earned?: unknown
          coins?: { total: number; lines: unknown[] }
          guestCoins?: { total: number; lines: unknown[] }
          gameType?: string
        } | null
        if (Array.isArray(body?.earned)) emitTrophiesEarned(body.earned, body?.gameType)
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
