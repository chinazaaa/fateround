let seq = 0

/**
 * Returns a process-unique realtime channel topic for `base`, e.g.
 * `uniqueTopic('sync-ABC')` → `sync-ABC-42`.
 *
 * supabase-js (>= 2.110) reuses a channel when one with the same topic already
 * exists. So when a view remounts or an effect re-runs before the previous
 * `removeChannel` (async) has finished, `supabase.channel('sync-ABC')` hands
 * back the still-subscribed channel and `.on('postgres_changes', …)` throws
 * ("cannot add callbacks after subscribe()"). A fresh suffix per subscription
 * guarantees a brand-new channel every time.
 *
 * Safe only for client-local subscriptions (postgres_changes) — do NOT use for
 * broadcast/presence, where all clients must share one topic name.
 */
export function uniqueTopic(base: string): string {
  seq += 1
  return `${base}-${seq}`
}
