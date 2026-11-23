/** Default waits before each retry of a failed read: three attempts, backing off. */
export const READ_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000]

/**
 * Bounded retry of a failed read. A view that keeps what is on screen when a snapshot read fails needs
 * something to read again: realtime events, polls and focus changes are not guaranteed to fire while the
 * board sits idle.
 *
 * - `schedule()` after a failed read: arms ONE timer (a pending timer is not stacked) that calls `retry`
 *   after the next backoff delay. Returns false, arming nothing, once the attempt limit is used up.
 * - `cancel()` clears a pending timer but keeps the attempt count: use it when a newer read starts (that read
 *   reschedules itself if it fails too) and on unmount.
 * - `reset()` cancels and restores the full budget: use it when a read succeeds or the round changes.
 *
 * A read that was superseded (a newer one was applied) should simply not call `schedule()`.
 */
export function createReadRetry(
  retry: () => void,
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

  const cancel = () => {
    if (armed) timers.clear(handle)
    armed = false
    handle = null
  }

  return {
    schedule(): boolean {
      if (armed) return true
      if (attempts >= delaysMs.length) return false
      const delay = delaysMs[attempts]!
      attempts++
      armed = true
      handle = timers.set(() => {
        armed = false
        handle = null
        try {
          retry()
        } catch {
          // A throwing retry is just another failed read; the next schedule() decides whether to go on.
        }
      }, delay)
      return true
    },
    cancel,
    reset() {
      cancel()
      attempts = 0
    },
    /** Retries used since the last reset (for tests). */
    attempts: () => attempts,
  }
}
