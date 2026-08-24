'use client'

import { useEffect } from 'react'

/**
 * Two jobs:
 *
 * 1. Fade out the server-rendered `#app-boot-loader` overlay once React has
 *    hydrated. The overlay lives in the root layout HTML so it paints
 *    immediately on cold load — including iOS Safari's full re-render after
 *    a memory-evicted tab returns from background — so users don't see a
 *    jarring near-white flash before the game view mounts.
 *
 * 2. Re-show the overlay briefly whenever the tab returns from being
 *    hidden for more than a moment. `useGameTableSync` already tears down
 *    and rebuilds the realtime channel + refetches on `visibilitychange`,
 *    but that round-trip takes ~500-800ms during which the UI shows stale
 *    state. Without visual feedback, users read that as the app hanging.
 *    Flashing the boot spinner for the duration gives them a "reconnecting"
 *    signal without any per-view plumbing.
 *
 * The overlay stays in the React tree (just toggled via class) to avoid
 * hydration mismatch.
 */

// How long the tab must have been hidden before we flash the overlay on
// return. A quick switch away and back (< 2s) doesn't need reconnecting UI.
const HIDDEN_THRESHOLD_MS = 2000
// How long to keep the overlay up on return. Comfortably covers the realtime
// re-subscribe + first refetch on a good connection; useGameTableSync's own
// recover will have started firing well before this elapses.
const RECOVERY_OVERLAY_MS = 800

export function BootLoaderHider() {
  useEffect(() => {
    document.body.classList.add('app-hydrated')
    const el = document.getElementById('app-boot-loader')
    if (!el) return

    // Initial fade of the cold-load overlay.
    const hideTimer = window.setTimeout(() => {
      el.classList.add('app-boot-loader--gone')
    }, 250)

    // Reconnecting-flash on tab return.
    let hiddenAt: number | null = null
    let reshowTimer: number | undefined

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt == null) return
      const wasHiddenFor = Date.now() - hiddenAt
      hiddenAt = null
      if (wasHiddenFor < HIDDEN_THRESHOLD_MS) return
      // Show the overlay again while realtime re-subscribes + views refetch.
      el.classList.remove('app-boot-loader--gone')
      // Force a reflow so the display:flex applies before opacity animates.
      void el.offsetWidth
      document.body.classList.remove('app-hydrated')
      window.clearTimeout(reshowTimer)
      reshowTimer = window.setTimeout(() => {
        document.body.classList.add('app-hydrated')
        window.setTimeout(() => {
          el.classList.add('app-boot-loader--gone')
        }, 250)
      }, RECOVERY_OVERLAY_MS)
    }

    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(reshowTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return null
}
