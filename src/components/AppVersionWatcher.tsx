'use client'

import { useEffect, useRef } from 'react'

/** Ignore focus/visibility storms: iOS fires visibilitychange AND focus on every
 *  app switch, and a user tabbing in and out shouldn't fetch on every event. */
const MIN_CHECK_INTERVAL_MS = 30_000
/** Fallback poll for tabs that stay foregrounded across a deploy without ever
 *  losing focus (e.g. a public leaderboard on a big screen). */
const POLL_INTERVAL_MS = 15 * 60 * 1000
/** A changed build id has to survive a second, independent check this far apart
 *  before we reload. See `pendingRef` below. */
const CONFIRM_DELAY_MS = 5_000

/**
 * Keeps an installed PWA / long-lived tab from drifting behind the deployed
 * version. Reads the current build id on mount, then re-checks whenever the
 * tab regains focus (visibility change or window focus) and periodically as a
 * fallback. If the server's build id changed, the page hard-reloads so the
 * user gets the new bundle without having to close and reopen the app.
 *
 * A hard reload mid-game is expensive (it drops the player back to a loading
 * screen and re-bootstraps the whole view), so the bar for firing one is high:
 *
 *  - a null/absent build id is "unknown", never "changed" — the server says so
 *    when it has no deploy-stable marker to report (see /api/version);
 *  - the new id must be seen TWICE, a few seconds apart, before we act. A single
 *    odd read — a half-rolled deploy still serving the old container, a stray
 *    error body — can't blow away a live session;
 *  - checks are single-flighted and rate-limited, so the visibilitychange+focus
 *    pair every app switch fires costs at most one request.
 *
 * Mounted in `app/layout.tsx` so every route (site, host, room) is covered.
 * A network failure is a no-op — the next visibility change tries again.
 */
export function AppVersionWatcher() {
  const initialRef = useRef<string | null>(null)
  const reloadingRef = useRef(false)
  const checkingRef = useRef(false)
  const lastCheckRef = useRef(0)
  // The changed build id awaiting confirmation, and when we first saw it.
  const pendingRef = useRef<{ buildId: string; seenAt: number } | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchBuildId = async (): Promise<string | null> => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return null
        const data = (await res.json().catch(() => null)) as { buildId?: string | null } | null
        return data?.buildId ?? null
      } catch {
        return null
      }
    }

    const check = async (force = false) => {
      if (cancelled || reloadingRef.current || checkingRef.current) return
      // Only check when the tab is actually visible — no point burning battery
      // polling on a hidden tab, and refocus already triggers a check.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      const now = Date.now()
      if (!force && now - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return

      checkingRef.current = true
      let buildId: string | null
      try {
        lastCheckRef.current = now
        buildId = await fetchBuildId()
      } finally {
        checkingRef.current = false
      }

      // No id (offline, an error body, or a server with no deploy-stable marker)
      // is "unknown" — hold whatever we already believe and try again later.
      if (cancelled || !buildId) return

      if (initialRef.current == null) {
        initialRef.current = buildId
        return
      }
      if (buildId === initialRef.current) {
        // Back to the id we booted on — whatever we were about to confirm was a blip.
        pendingRef.current = null
        return
      }

      // Changed. Confirm it with a second read before reloading a live session.
      const pending = pendingRef.current
      if (!pending || pending.buildId !== buildId) {
        pendingRef.current = { buildId, seenAt: Date.now() }
        setTimeout(() => void check(true), CONFIRM_DELAY_MS)
        return
      }
      if (Date.now() - pending.seenAt < CONFIRM_DELAY_MS) return

      reloadingRef.current = true
      // Small delay so any in-flight user interaction settles (e.g. a click
      // that's about to save state) before we blow the page away.
      setTimeout(() => {
        if (typeof window !== 'undefined') window.location.reload()
      }, 100)
    }

    // First read establishes the baseline — always run it.
    void check(true)

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const onFocus = () => void check()

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)

    const interval = setInterval(() => void check(true), POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [])

  return null
}
