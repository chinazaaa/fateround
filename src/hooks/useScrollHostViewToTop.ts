import { useEffect, useRef } from 'react'

/** Scroll the host page to the top after layout settles. */
export function scrollHostViewToTop() {
  if (typeof window === 'undefined') return
  const run = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }
  run()
  requestAnimationFrame(() => {
    requestAnimationFrame(run)
  })
}

/**
 * Keeps the host at the top of the page when a game begins or switches to the Play tab.
 * Without this, the viewport often stays where the Start button was (near the bottom).
 */
export function useScrollHostViewToTop({
  gameStatus,
  tab,
  playTab = 'play',
}: {
  gameStatus?: string | null
  tab?: string
  playTab?: string
}) {
  const prevStatus = useRef(gameStatus)
  const prevTab = useRef(tab)

  useEffect(() => {
    const becameActive = prevStatus.current === 'waiting' && gameStatus === 'active'
    const switchedToPlay = tab != null && tab === playTab && prevTab.current !== playTab

    if (becameActive || switchedToPlay) {
      scrollHostViewToTop()
    }

    prevStatus.current = gameStatus
    prevTab.current = tab
  }, [gameStatus, tab, playTab])
}
