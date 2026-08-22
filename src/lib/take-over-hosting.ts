import { authHeaders } from '@/lib/identity'
import { rememberHostToken } from '@/lib/host-session'

/**
 * Move hosting to the device you are on.
 *
 * WHY THIS EXISTS. Open a game you are already hosting from your phone on a second device and
 * the join call answers `409 already_hosting`. The only thing offered was "continue on this
 * device", which retried the join with an override and seated you as an ordinary PLAYER —
 * hosting stayed on the phone. So a host on their laptop could join their own game and still
 * have no way to run it, which is not what "continue on this device" reads as.
 *
 * The server half was already built: `/api/games/[code]/reclaim-host` hands the host token to
 * whoever owns `games.host_user_id`, on any device. `useHostToken` uses it to recover a host
 * whose local storage was cleared. Nothing had ever offered it from the JOIN path, which is
 * where a host on a second device actually lands.
 *
 * DELIBERATELY NOT A ROTATION. The player equivalent rotates the resume token so continuing
 * here MOVES control rather than cloning it. Hosting is the opposite case: both devices belong
 * to the same account, and invalidating the phone's token would leave it holding a dead
 * credential mid-game with no path back — a worse failure than two devices that can both run
 * a game one person owns. So the token is handed over, not moved.
 *
 * Returns null when the caller is a guest, is not this game's host, or the request fails. Every
 * one of those means "carry on with the normal join", never an error to show.
 */
export async function takeOverHosting(code: string): Promise<string | null> {
  try {
    const auth = await authHeaders()
    // A guest has no profile for `host_user_id` to match, so there is nothing to reclaim.
    if (!auth?.Authorization) return null

    const res = await fetch(`/api/games/${encodeURIComponent(code)}/reclaim-host`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
    })
    if (!res.ok) return null

    const data = (await res.json().catch(() => null)) as { hostToken?: unknown } | null
    const token = typeof data?.hostToken === 'string' ? data.hostToken : ''
    if (!token) return null

    rememberHostToken(code, token)
    return token
  } catch {
    return null
  }
}

/** Where to send someone once they have taken hosting over. */
export function hostHref(code: string): string {
  return `/host/${encodeURIComponent(code.toUpperCase())}`
}
