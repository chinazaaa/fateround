'use client'

import { useEffect, useRef } from 'react'

/**
 * Keeps an installed PWA / long-lived tab from drifting behind the deployed
 * version. Reads the current build id on mount, then re-checks whenever the
 * tab regains focus (visibility change or window focus) and periodically as a
 * fallback. If the server's build id changed, the page hard-reloads so the
 * user gets the new bundle without having to close and reopen the app.
 *
 * Mounted in `app/layout.tsx` so every route (site, host, room) is covered.
 * A network failure is a no-op — the next visibility change tries again.
 */
export function AppVersionWatcher() {
  const initialRef = useRef<string | null>(null)
  const reloadingRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const fetchBuildId = async (): Promise<string | null> => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return null
        const data = (await res.json().catch(() => null)) as { buildId?: string } | null
        return data?.buildId ?? null
      } catch {
        return null
      }
    }

    const check = async () => {
      if (cancelled || reloadingRef.current) return
      // Only check when the tab is actually visible — no point burning battery
      // polling on a hidden tab, and refocus already triggers a check.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const buildId = await fetchBuildId()
      if (cancelled || !buildId) return
      if (initialRef.current == null) {
        initialRef.current = buildId
        return
      }
      if (buildId !== initialRef.current) {
        reloadingRef.current = true
        // Small delay so any in-flight user interaction settles (e.g. a click
        // that's about to save state) before we blow the page away.
        setTimeout(() => {
          if (typeof window !== 'undefined') window.location.reload()
        }, 100)
      }
    }

    void check()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', () => void check())

    // Fallback poll — 15 min — for tabs that stay foregrounded across a deploy
    // without ever losing focus (e.g. a public leaderboard on a big screen).
    const interval = setInterval(() => void check(), 15 * 60 * 1000)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [])

  return null
}
