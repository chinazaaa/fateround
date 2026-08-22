'use client'

import { useEffect } from 'react'
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
 * Dedup is MODULE-scoped, not component-scoped: `reset()` unmounts and
 * remounts this component, so a component-scoped ref would forget the
 * retry across mounts. If the retry itself errors, the fresh boundary
 * would retry again — a tight reset/error/reset loop that Safari can't
 * unwind, showing as a frozen tab (reported by the user). Module scope
 * means: at most one auto-retry per unique error in this page lifetime.
 *
 * The retry is also deferred a beat so it doesn't run synchronously
 * inside the render that reported the error — that gives React a chance
 * to unmount the old tree cleanly before we ask it to try again.
 */

// Digests of errors we've already auto-retried. Cleared only by a hard reload.
const retriedDigests = new Set<string>()

export default function GlobalErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global Error Boundary caught:', error)
  }, [error])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    // Prefer digest (stable across mounts); fall back to message so an error without
    // a Next.js digest still gets a stable identity.
    const key = error.digest || error.message || 'unknown-error'
    if (retriedDigests.has(key)) return

    let timeoutId: number | null = null

    const tryAutoReset = () => {
      if (retriedDigests.has(key)) return
      // Only retry if the tab is actually visible (a hidden tab reset would
      // just re-fire) AND the browser thinks the network is up.
      if (document.visibilityState !== 'visible') return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      // Mark BEFORE calling reset(): if reset() re-throws the same error, the
      // fresh mount checks retriedDigests first and sees it's been used.
      retriedDigests.add(key)
      // Defer past this render/microtask so the error boundary can unmount its
      // subtree cleanly before Next attempts to remount it. Without this the
      // retry runs inside the same tick as the error and Safari can pin the
      // main thread on a reset loop when the retry immediately re-throws.
      timeoutId = window.setTimeout(reset, 200)
    }

    // If we mount while already visible + online, retry (deferred).
    tryAutoReset()

    document.addEventListener('visibilitychange', tryAutoReset)
    window.addEventListener('online', tryAutoReset)
    return () => {
      document.removeEventListener('visibilitychange', tryAutoReset)
      window.removeEventListener('online', tryAutoReset)
      if (timeoutId != null) window.clearTimeout(timeoutId)
    }
  }, [error, reset])

  return <ServerErrorPage error={error} reset={reset} />
}
