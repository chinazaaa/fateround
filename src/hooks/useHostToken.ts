'use client'

import { useEffect, useState } from 'react'
import { readHostToken, rememberHostToken } from '@/lib/host-session'

/**
 * Resolve the host token for a host-panel page, the way tournaments do it:
 *
 * - If the URL carries `?token=` (a host link opened on another device / from the saved
 *   link), save it to this device and strip it from the address bar so it isn't shoulder-
 *   surfed or re-shared, then use it.
 * - Otherwise use the token this device remembered at create time (clean `/host/[code]`).
 *
 * Everything happens in an effect, never during render, so the server and first client
 * render agree (no hydration mismatch). `resolved` flips true once we've checked, letting
 * callers hold off any "access denied" decision until the token is actually known.
 */
export function useHostToken(code: string | null): { hostToken: string; resolved: boolean } {
  const [state, setState] = useState<{ token: string; resolved: boolean }>({ token: '', resolved: false })

  useEffect(() => {
    if (typeof window === 'undefined' || !code) return
    const url = new URL(window.location.href)
    const urlToken = url.searchParams.get('token')
    if (urlToken) {
      rememberHostToken(code, urlToken)
      url.searchParams.delete('token')
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
      setState({ token: urlToken, resolved: true })
      return
    }
    setState({ token: readHostToken(code) ?? '', resolved: true })
  }, [code])

  return { hostToken: state.token, resolved: state.resolved }
}
