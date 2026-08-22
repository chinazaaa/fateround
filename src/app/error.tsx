'use client'

import { useEffect, useRef } from 'react'
import { ServerErrorPage } from '@/components/ServerErrorPage'

/**
 * Global error boundary.
 *
 * iOS Safari (and any mobile browser under memory pressure) will suspend a
 * background tab; when you switch back — from WhatsApp, from another app —
 * the tab resumes and any in-flight fetch, background revalidation, or
 * navigation prefetch that was in flight can reject with a NetworkError,
 * bubbling into this boundary. That's not a real "the server is down"
 * situation — it's a resume hiccup and the very next fetch usually
 * succeeds. So we auto-retry once when the tab is actually visible AND the
 * browser reports online; only if THAT retry also errors does the user see
 * the "Can't reach server" screen.
 *
 * The auto-retry only fires once per boundary instance — if the user hits a
 * genuine error, they still see it and can Try again themselves.
 */
export default function GlobalErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const autoResetTriedRef = useRef(false)

  useEffect(() => {
    console.error('Global Error Boundary caught:', error)
  }, [error])

  useEffect(() => {
    if (autoResetTriedRef.current) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const tryAutoReset = () => {
      if (autoResetTriedRef.current) return
      // Only retry if the tab is actually visible (a hidden tab reset would
      // just re-fire and burn the one retry we allow) AND the browser thinks
      // the network is up. navigator.onLine is best-effort but reliable
      // enough to gate a single opportunistic retry.
      if (document.visibilityState !== 'visible') return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      autoResetTriedRef.current = true
      reset()
    }

    // If we mount while already visible + online, retry immediately.
    tryAutoReset()

    document.addEventListener('visibilitychange', tryAutoReset)
    window.addEventListener('online', tryAutoReset)
    return () => {
      document.removeEventListener('visibilitychange', tryAutoReset)
      window.removeEventListener('online', tryAutoReset)
    }
  }, [reset])

  return <ServerErrorPage error={error} reset={reset} />
}
