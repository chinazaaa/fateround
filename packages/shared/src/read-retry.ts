/** Default waits before each retry of a failed read: three attempts, backing off. */
export const READ_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000]

export interface ReadRetry {
  schedule(): boolean
  cancel(): void
  reset(): void
  scope(key: string | null): void
  attempts(): number
}

/**
 * Bounded retry of a failed read. A view that keeps what is on screen when a snapshot read fails needs
 * something to read again: realtime events, polls and focus changes are not guaranteed to fire while the
 * board sits idle.
 *
 * - `schedule()` after a failed read: arms ONE timer (a pending timer is not stacked) that calls `retry`
 *   after the next backoff delay. Returns false, arming nothing, once the attempt limit is used up.
 * - `cancel()` clears a pending timer but keeps the attempt count: use it when a newer read starts (that read
 *   reschedules itself if it fails too) and on unmount.
 * - `reset()` cancels and restores the full budget: use it when a read succeeds.
 * - `scope(key)` resets the budget ONCE when `key` (the requested round) differs from the last one; call it
 *   before that round's reads can fail, so a budget used up on an old round never starves the new one. The
 *   same key again changes nothing.
 *
 * `retry` returns whether the read it ran failed (`false`, or a throw / rejection) or not. A failed retry
 * schedules the next attempt by itself, so a read that fails before it can reach the caller's own
 * `schedule()` (e.g. the game/players query) still gets the remaining attempts. A resolved `true` changes
 * nothing: the read's own code resets (success) or schedules (failed snapshot). The outcome of a retry is
 * dropped when `cancel()`/`reset()`/`scope()` ran after it started: something newer owns the budget.
 *
 * A read that was superseded (a newer one was applied) should simply not call `schedule()`.
 */
export function createReadRetry(
  retry: () => Promise<boolean> | boolean,
  delaysMs: readonly number[] = READ_RETRY_DELAYS_MS,
  timers: {
    set: (fn: () => void, ms: number) => unknown
    clear: (handle: unknown) => void
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }
) {
  let attempts = 0
  let handle: unknown = null
  let armed = false
  let epoch = 0
  let scopeKey: string | null | undefined = undefined

  const cancel = () => {
    epoch++
    if (armed) timers.clear(handle)
    armed = false
    handle = null
  }

  const api: ReadRetry = {
    schedule(): boolean {
      if (armed) return true
      if (attempts >= delaysMs.length) return false
      const delay = delaysMs[attempts]!
      attempts++
      armed = true
      handle = timers.set(() => {
        armed = false
        handle = null
        const started = epoch
        const failed = () => {
          if (epoch === started) api.schedule()
        }
        try {
          void Promise.resolve(retry()).then((ok) => {
            if (ok === false) failed()
          }, failed)
        } catch {
          failed()
        }
      }, delay)
      return true
    },
    cancel,
    reset() {
      cancel()
      attempts = 0
    },
    scope(key: string | null) {
      if (key === scopeKey) return
      scopeKey = key
      api.reset()
    },
    /** Retries used since the last reset (for tests). */
    attempts: () => attempts,
  }
  return api
}
