import { createClient } from '@supabase/supabase-js'

import { noteChannelStatus, registerChannel, unregisterChannel } from './realtime-health'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Ceiling on a single PostgREST request from the browser, headers AND body. Well past a
 *  slow-but-real read on a bad mobile connection; short enough that a caller waiting on it
 *  recovers. */
export const REQUEST_TIMEOUT_MS = 20_000

/**
 * `fetch` with a hard deadline. iOS Safari suspends in-flight requests when the tab goes to
 * the background and, on return, some of them are neither completed nor failed — the promise
 * just never settles. Every caller awaiting that read hangs with it (a game view stuck on its
 * loading spinner, a poll that never schedules its next tick), so give each request a deadline
 * and let it reject like any other network failure.
 *
 * The deadline deliberately stays armed after `fetch()` resolves. postgrest-js only gets
 * headers from that promise and then calls `res.text()` to read the body, so clearing the
 * timer on resolve would leave a response that delivers headers and then stalls mid-body
 * hanging exactly as before. Aborting the controller once everything has already been read is
 * a no-op, so there is nothing to clean up — the one-shot timer just expires.
 *
 * Only PostgREST calls go through here — realtime is a WebSocket, and storage uploads use the
 * server-side clients — so no long-lived request is at risk of being cut short.
 */
export const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  // Respect a caller-supplied signal too: abort ours when theirs fires.
  const callerSignal = init?.signal
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  return fetch(input, { ...init, signal: controller.signal })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
})

/**
 * Report every channel's subscription state into the realtime-health store, so `usePolling` can
 * stand down while realtime is actually delivering.
 *
 * Done by wrapping the client rather than at the ~33 call sites that open channels: the signal is
 * only useful if it sees ALL of them, and a per-call-site opt-in would silently rot the moment
 * someone adds a channel without it. Wrapping means a new channel is tracked by default.
 *
 * Both wrappers preserve return values and forward the caller's own status callback unchanged, so
 * existing `.subscribe((status) => ...)` handlers keep working.
 */
const openChannel = supabase.channel.bind(supabase)
const closeChannel = supabase.removeChannel.bind(supabase)
const channelTokens = new WeakMap<object, symbol>()

supabase.channel = ((name: string, opts?: Parameters<typeof openChannel>[1]) => {
  const channel = opts ? openChannel(name, opts) : openChannel(name)
  const token = registerChannel()
  channelTokens.set(channel, token)

  const subscribe = channel.subscribe.bind(channel)
  channel.subscribe = ((callback?: Parameters<typeof subscribe>[0], timeout?: number) =>
    subscribe((status, err) => {
      noteChannelStatus(token, status)
      callback?.(status, err)
    }, timeout)) as typeof channel.subscribe

  return channel
}) as typeof supabase.channel

supabase.removeChannel = ((channel: Parameters<typeof closeChannel>[0]) => {
  const token = channelTokens.get(channel)
  // Untrack BEFORE the async removal resolves. A channel being torn down must stop counting
  // against health immediately, or a page unmounting several channels briefly reads as unhealthy
  // and kicks off a burst of full-speed polls on its way out.
  if (token) {
    unregisterChannel(token)
    channelTokens.delete(channel)
  }
  return closeChannel(channel)
}) as typeof supabase.removeChannel
