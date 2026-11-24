import { awaitLoadSettled } from './load-settled'

/**
 * Singleflight for a view's `load()`: overlapping callers (mount, realtime, polls, submits) must not interleave
 * their state writes, so while one run is in flight extra calls only flag ONE trailing re-run, and the caller that
 * needs the real outcome (`loadSettled`) waits for the whole chain.
 *
 * A run that has been going for `staleMs` without settling (a fetch the OS suspended and never answered) is
 * abandoned by the next caller: its generation is bumped, so it can no longer release the latch or publish, and
 * whoever waited on it is told `false`. Starting the replacement also drops the abandoned chain's queued
 * re-run: that request is answered by the replacement's own (fresher) read, and keeping it would make the
 * replacement read twice.
 *
 * `invalidate()` supersedes everything in flight for good (unmount, or the view moving to another room): the
 * running chain is abandoned and nothing queued survives. `close()` also refuses later `load()` calls until
 * `open()`, for a late caller (a flip answer, a retry timer) that must not start a load that publishes into nothing.
 */
export function createLoadCoordinator(args: {
  /**
   * One run for generation `gen`: it is superseded once `isCurrent(gen)` turns false. A rejection counts as failed.
   * Optional here because a view's latest closure is usually installed later with `setRun`.
   */
  run?: (gen: number) => Promise<boolean>
  staleMs: number
  now?: () => number
}) {
  let run: (gen: number) => Promise<boolean> = args.run ?? (async () => false)
  const now = args.now ?? (() => Date.now())
  let gen = 0
  let loading = false
  let pending = false
  let startedAt = 0
  let chain: Promise<boolean> | null = null
  let abandonChain: (() => void) | null = null
  let open = true

  const invalidate = () => {
    gen++
    loading = false
    pending = false
    abandonChain?.()
    abandonChain = null
    chain = null
  }

  const load = (): Promise<boolean> => {
    if (!open) return Promise.resolve(false)
    if (loading && now() - startedAt < args.staleMs) {
      pending = true
      return Promise.resolve(true)
    }
    // Nothing is running, or what is running is stuck past the deadline: orphan it (its latch release and state
    // writes are dropped), tell whoever waits on it that it failed, and forget what it had queued.
    abandonChain?.()
    pending = false
    const mine = ++gen
    loading = true
    startedAt = now()
    let abandon: () => void = () => {}
    const abandoned = new Promise<boolean>((resolve) => {
      abandon = () => resolve(false)
    })
    const runChain = (async (): Promise<boolean> => {
      try {
        // A run that REJECTS (e.g. a query that throws) must not skip the trailing re-run a caller queued while it
        // ran: that caller asked for a fresher snapshot and is owed one. Remember the failure and go on; it is only
        // what the chain reports when no later run replaces it.
        let ok = true
        let failure: { error: unknown } | null = null
        const attempt = async () => {
          try {
            ok = await run(mine)
            failure = null
          } catch (error) {
            failure = { error }
          }
        }
        await attempt()
        while (pending && mine === gen) {
          pending = false
          startedAt = now()
          await attempt()
        }
        if (failure) throw (failure as { error: unknown }).error
        return ok
      } finally {
        if (mine === gen) loading = false
      }
    })()
    const result = Promise.race([runChain, abandoned])
    abandonChain = abandon
    chain = result
    return result
  }

  // Like `load`, but a call that joins a run already in flight resolves with the queued run's real outcome rather
  // than `true` straight away: for a caller that owns a retry and must know whether the read it asked for succeeded.
  const loadSettled = (): Promise<boolean> => {
    let waitFor: Promise<boolean>
    if (loading && chain && now() - startedAt < args.staleMs) {
      pending = true
      waitFor = chain
    } else {
      // Starting the load here: it gets the same deadline, or a games query that never settles would leave the
      // caller waiting forever.
      waitFor = load()
    }
    // The deadline follows the run the chain is on NOW, not the one this caller arrived during: a trailing re-run
    // gets its own window (startedAt is reset when it starts).
    return awaitLoadSettled({
      waitFor,
      runStartedAt: () => (loading ? startedAt : null),
      staleMs: args.staleMs,
      now,
    })
  }

  return {
    load,
    loadSettled,
    /** Install the latest run closure (a view's callbacks change identity); in-flight runs keep theirs. */
    setRun(next: (gen: number) => Promise<boolean>) {
      run = next
    },
    invalidate,
    /** Unmount: supersede everything and refuse new loads until `open()`. */
    close() {
      open = false
      invalidate()
    },
    open() {
      open = true
    },
    /** True while a run of generation `g` has not been superseded. */
    isCurrent: (g: number) => g === gen,
    /** True while a chain is running (for tests). */
    isLoading: () => loading,
  }
}
