/** Default waits before each retry of a failed read: three attempts, backing off. */
export const READ_RETRY_DELAYS_MS: readonly number[] = [1000, 2000, 4000]

export interface ReadRetry {
  schedule(): boolean
  cancel(): void
  cancelPending(): void
  reset(): void
  scope(key: string | null): void
  attempts(): number
  /** True while a retry timer is armed: a later attempt is already owed, so nobody else needs to schedule one. */
  pending(): boolean
}

/**
 * Outcome of a read for a caller that owns its OWN retry (the flip tracker's resync): a failed read counts as
 * handled while `retry` has an attempt armed for it, so the same failure is not retried by two owners.
 */
export function readOutcomeOwned(ok: unknown, retry: Pick<ReadRetry, 'pending'>): boolean {
  return ok !== false || retry.pending()
}

/**
 * Bounded retry of a failed read. A view that keeps what is on screen when a snapshot read fails needs
 * something to read again: realtime events, polls and focus changes are not guaranteed to fire while the
 * board sits idle.
 *
 * - `schedule()` after a failed read: arms ONE timer (a pending timer is not stacked) that calls `retry`
 *   after the next backoff delay. Returns false, arming nothing, once the attempt limit is used up. An attempt
 *   is only charged to the budget when its timer FIRES: a timer that is cancelled (`cancel`/`cancelPending`)
 *   before it fires used nothing, so a burst of ordinary refreshes cannot burn the whole budget while no
 *   retry ever ran.
 * - `cancel()` clears a pending timer but keeps the attempt count: use it when a newer read starts (that read
 *   reschedules itself if it fails too) and on unmount.
 * - `cancelPending()` clears only a pending timer. Use it when a newer read takes over: unlike `cancel()` it does
 *   not invalidate a retry that is ALREADY RUNNING (its own read is the one that started this takeover), so if the
 *   replacement read stalls or fails, that retry's failure handler still arms the next attempt. The running retry
 *   stays the owner until a read succeeds (`reset()`), the requested round changes (`scope()`) or the view goes
 *   away (`cancel()`).
 * - `reset()` cancels and restores the full budget: use it when a read succeeds.
 * - `scope(key)` resets the budget ONCE when `key` (the requested round) differs from the last one; call it
 *   before that round's reads can fail, so a budget used up on an old round never starves the new one. The
 *   same key again changes nothing. A retry that is RUNNING when the round changes (its read discovered the new
 *   round) is not invalidated: the read it is waiting on is now that round's read, so it stays the owner and
 *   arms the next attempt, from the fresh budget, if that read fails or stalls.
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
  /** Retries whose read is still running (started by a fired timer, not yet settled). */
  let running = 0
  let scopeKey: string | null | undefined = undefined

  const cancel = () => {
    epoch++
    if (armed) timers.clear(handle)
    armed = false
    handle = null
  }

  const cancelPending = () => {
    if (armed) timers.clear(handle)
    armed = false
    handle = null
  }

  const api: ReadRetry = {
    schedule(): boolean {
      if (armed) return true
      if (attempts >= delaysMs.length) return false
      const delay = delaysMs[attempts]!
      armed = true
      handle = timers.set(() => {
        armed = false
        handle = null
        // Charged now, not when armed: only an attempt that actually ran uses the budget.
        attempts++
        const started = epoch
        running++
        const settle = () => {
          running--
        }
        const failed = () => {
          settle()
          if (epoch === started) api.schedule()
        }
        try {
          void Promise.resolve(retry()).then((ok) => {
            if (ok === false) failed()
            else settle()
          }, failed)
        } catch {
          failed()
        }
      }, delay)
      return true
    },
    cancel,
    cancelPending,
    reset() {
      cancel()
      attempts = 0
    },
    scope(key: string | null) {
      if (key === scopeKey) return
      scopeKey = key
      if (running > 0) {
        // The retry that is running keeps owning its read's outcome (see above); only its budget is renewed.
        cancelPending()
        attempts = 0
      } else api.reset()
    },
    pending: () => armed,
    /** Retries used since the last reset (for tests). */
    attempts: () => attempts,
  }
  return api
}
