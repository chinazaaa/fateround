import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Ceiling on a single PostgREST request from the browser. Well past a slow-but-real
 *  read on a bad mobile connection; short enough that a caller waiting on it recovers. */
const REQUEST_TIMEOUT_MS = 20_000

/**
 * `fetch` with a hard deadline. iOS Safari suspends in-flight requests when the tab goes
 * to the background and, on return, some of them are neither completed nor failed — the
 * promise just never settles. Every caller awaiting that read hangs with it (a game view
 * stuck on its loading spinner, a poll that never schedules its next tick), so give each
 * request a deadline and let it reject like any other network failure.
 *
 * Only PostgREST calls go through here — realtime is a WebSocket, and storage uploads use
 * the server-side clients — so no long-lived request is at risk of being cut short.
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  // Respect a caller-supplied signal too: abort ours when theirs fires.
  const callerSignal = init?.signal
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
})
