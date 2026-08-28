'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { supabase } from '@/lib/supabase'

/**
 * Tags Sentry events with the Supabase user id, so a report answers "which player hit
 * this?" instead of just "someone did".
 *
 * IDs ONLY — never a handle, an email or anything else a person could be identified by
 * outside our own database (`sendDefaultPii` stays false; see src/lib/sentry-shared.ts).
 * A guest who has never finished a game has no id at all and stays anonymous.
 *
 * Renders nothing, and every call here is a no-op when Sentry is uninitialised (no DSN),
 * so it costs a subscription and nothing else in local dev.
 */
export function SentryUserContext() {
  useEffect(() => {
    if (!supabase?.auth) return

    // The Supabase session hydrates from storage ASYNCHRONOUSLY, so there is no session to
    // read on mount. `onAuthStateChange` fires INITIAL_SESSION once it is restored, plus on
    // sign-in/out, token refresh and the anonymous -> account upgrade, which is every moment
    // the id can change — the same reason useProfile subscribes to it rather than polling.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id
      Sentry.setUser(id ? { id } : null)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return null
}
