'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { ServerErrorPage } from '@/components/ServerErrorPage'

/**
 * Global error boundary.
 *
 * Deliberately does nothing but show the error screen. It used to auto-`reset()`
 * itself on tab resume, to hide the "Can't reach server" flash people saw after
 * switching back from another app. `reset()` re-mounts the ENTIRE route, so every
 * app switch that tripped this boundary tore the whole game down — realtime
 * subscriptions, in-memory state, every fetch — and rebuilt it from a loading
 * spinner. Three follow-up commits widened when that fired (once per boundary →
 * once per error → once per resume, i.e. every single app switch), each one
 * making the teardown more frequent rather than less.
 *
 * The flash it was hiding is a symptom: something throws when the tab resumes,
 * and none of those four attempts touched it, because nothing ever showed WHAT
 * throws. So: no auto-retry, no silent placeholder. The error surfaces, with its
 * identity on screen (see ServerErrorPage), and "Try again" is the user's to
 * press — the behaviour this page had before any of it.
 */
export default function GlobalErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global Error Boundary caught:', error)
    // Report it. The console line above is only visible to whoever has devtools open on
    // the broken tab, which — see the note above — is exactly why four attempts at the
    // tab-resume bug were made without anyone seeing what actually threw.
    Sentry.captureException(error)
  }, [error])

  return <ServerErrorPage error={error} reset={reset} />
}
