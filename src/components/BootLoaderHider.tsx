'use client'

import { useEffect } from 'react'

/**
 * Fades out the server-rendered `#app-boot-loader` overlay once React has
 * hydrated. The overlay lives in the root layout HTML so it paints
 * immediately on cold load — including iOS Safari's full re-render after
 * a memory-evicted tab returns from background, which is what previously
 * showed users a jarring near-white flash before the game view mounted.
 *
 * The overlay stays in the React tree (just hidden via class) to avoid
 * hydration mismatch.
 */
export function BootLoaderHider() {
  useEffect(() => {
    document.body.classList.add('app-hydrated')
    const el = document.getElementById('app-boot-loader')
    if (!el) return
    const timer = window.setTimeout(() => {
      el.classList.add('app-boot-loader--gone')
    }, 250)
    return () => window.clearTimeout(timer)
  }, [])
  return null
}
