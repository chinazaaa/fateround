'use client'

import { useEffect, useState } from 'react'
import { readHostToken, rememberHostToken } from '@/lib/host-session'
import { authHeaders } from '@/lib/auth-headers'

/**
 * Resolve the host token for a host-panel page, the way tournaments do it:
 *
 * - If the URL carries `?token=` (a host link opened on another device / from the saved
 *   link), save it to this device and strip it from the address bar so it isn't shoulder-
 *   surfed or re-shared, then use it.
 * - Otherwise use the token this device remembered at create time (clean `/host/[code]`).
 * - Otherwise, if the caller is signed in and the game's `host_user_id` matches their
 *   profile, reclaim the token from the server. This is the recovery path for a host who
 *   cleared storage, is in a different browser, or opened the game on a new device — the
 *   profile is durable proof of hostship, so their permissions shouldn't disappear with
 *   localStorage. See `docs/accounts-and-identity-plan.md` §3 (additive, never gates play).
 *
 * Everything happens in an effect, never during render, so the server and first client
 * render agree (no hydration mismatch). `resolved` flips true once we've checked, letting
 * callers hold off any "access denied" decision until the token is actually known.
 */
export function useHostToken(code: string | null): { hostToken: string; resolved: boolean } {
  const [state, setState] = useState<{ token: string; resolved: boolean }>({ token: '', resolved: false })

  useEffect(() => {
    if (typeof window === 'undefined' || !code) return
    let cancelled = false

    const finish = (token: string) => {
      if (cancelled) return
      setState({ token, resolved: true })
    }

    const url = new URL(window.location.href)
    const urlToken = url.searchParams.get('token')
    if (urlToken) {
      rememberHostToken(code, urlToken)
      url.searchParams.delete('token')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
      setTimeout(() => finish(urlToken), 0)
      return () => {
        cancelled = true
      }
    }

    const local = readHostToken(code)
    if (local) {
      setTimeout(() => finish(local), 0)
      return () => {
        cancelled = true
      }
    }

    // No local token. Try to reclaim by profile — a signed-in host whose `host_user_id`
    // matches gets their token back. Guests, non-hosts, and network failures all resolve
    // to empty, which lands on the existing "unauthorized host" UI.
    ;(async () => {
      try {
        const auth = await authHeaders()
        if (!auth.Authorization) {
          finish('')
          return
        }
        const res = await fetch(`/api/games/${encodeURIComponent(code)}/reclaim-host`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...auth },
        })
        if (!res.ok) {
          finish('')
          return
        }
        const data = (await res.json().catch(() => null)) as { hostToken?: unknown } | null
        const reclaimed = typeof data?.hostToken === 'string' ? data.hostToken : ''
        if (reclaimed) rememberHostToken(code, reclaimed)
        finish(reclaimed)
      } catch {
        finish('')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [code])

  return { hostToken: state.token, resolved: state.resolved }
}
