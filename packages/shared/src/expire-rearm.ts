/**
 * Re-arm schedule for a client that drives a turn/phase expiry endpoint (web `useTurnTimer`, mobile
 * `useTurnExpiryTimer`). The server owns the real deadline; a 200 `skipped` verdict is ambiguous:
 * it can be ordinary clock skew (the deadline is live and about to expire), or a leave that committed
 * before the expiry reloaded (the deadline stays expired and only a retry resolves it), or a genuinely dead
 * deadline. So the first `graceSkips` skips keep the flat `cooldownMs` cadence, and only sustained skipping
 * backs off exponentially up to `maxBackoffMs`. A non-2xx answer is terminal, not skew: it backs off at once.
 */
export type ExpireRearmInput = {
  /** Consecutive refused/skipped attempts so far for the current deadline. */
  streak: number
  /** The HTTP response was 2xx. */
  ok: boolean
  /** The 2xx body said `skipped`. */
  skipped: boolean
  cooldownMs: number
  graceSkips: number
  maxBackoffMs: number
}

export function nextExpireRearm({ streak, ok, skipped, cooldownMs, graceSkips, maxBackoffMs }: ExpireRearmInput): {
  streak: number
  rearmMs: number
} {
  if (ok && !skipped) return { streak: 0, rearmMs: cooldownMs }
  const next = streak + 1
  const overGrace = ok ? next - graceSkips : next
  return { streak: next, rearmMs: overGrace > 0 ? Math.min(cooldownMs * 2 ** overGrace, maxBackoffMs) : cooldownMs }
}

/** True when an expire endpoint's resolved payload says the server did not act on the deadline. */
export function isSkippedExpire(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null && (payload as { skipped?: unknown }).skipped === true
}
