'use client'

import { useEffect, useRef, useState } from 'react'

type NetState = 'online' | 'offline' | 'recovered'

/**
 * A small, global connection indicator. When the device drops its network the
 * app can't reach Supabase, so live state (chess clocks, turns, scores) stops
 * updating and then snaps forward when the connection returns — which reads as a
 * "jumping" timer. This surfaces that: an "Offline" pill while disconnected and a
 * brief "Back online" confirmation on recovery, so players can tell a stutter is
 * their network rather than the game.
 *
 * Parked top-centre so it never adds to the floating controls at the bottom.
 * Renders nothing while the connection is healthy.
 */
export function NetworkIndicator() {
  const [state, setState] = useState<NetState>('online')
  const recoveredTimer = useRef<number | null>(null)

  useEffect(() => {
    // navigator.onLine is only meaningful in the browser; assume online on the server.
    const clearRecovered = () => {
      if (recoveredTimer.current != null) {
        window.clearTimeout(recoveredTimer.current)
        recoveredTimer.current = null
      }
    }

    const goOffline = () => {
      clearRecovered()
      setState('offline')
    }

    const goOnline = () => {
      // Only flash "Back online" if we were actually offline, not on first load.
      setState((prev) => {
        if (prev !== 'offline') return 'online'
        clearRecovered()
        recoveredTimer.current = window.setTimeout(() => setState('online'), 2500)
        return 'recovered'
      })
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) setState('offline')

    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      clearRecovered()
    }
  }, [])

  if (state === 'online') return null

  const offline = state === 'offline'

  return (
    <div className="fixed left-1/2 top-3 z-[60] -translate-x-1/2 pointer-events-none" role="status" aria-live="polite">
      <div
        className={[
          'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur',
          offline
            ? 'border-rose-400/60 bg-rose-500/20 text-rose-100'
            : 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100',
        ].join(' ')}
      >
        <span
          className={['h-2 w-2 rounded-full', offline ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'].join(' ')}
          aria-hidden
        />
        {offline ? 'Offline — reconnecting…' : 'Back online'}
      </div>
    </div>
  )
}
