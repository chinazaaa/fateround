/**
 * Waits for a load chain (a run plus its queued trailing re-runs) to settle, but gives up with `false` when the run
 * the chain is CURRENTLY on has been going for `staleMs` without settling (a read that never answers).
 *
 * The deadline is anchored to the running run, not to when this waiter happened to arrive: a waiter that joined
 * a run which then queued a trailing re-run must not time out on the first run's clock while the trailing run is
 * still inside its own `staleMs` window. Each time the timer fires it re-reads when the current run started
 * (`runStartedAt`) and, if that run is still within its window, waits out the rest of it instead of resolving.
 *
 * `runStartedAt()` returns when the run now executing the chain started, or null when none is running.
 */
export function awaitLoadSettled(args: {
  waitFor: Promise<boolean>
  runStartedAt: () => number | null
  staleMs: number
  now?: () => number
  timers?: {
    set: (fn: () => void, ms: number) => unknown
    clear: (handle: unknown) => void
  }
}): Promise<boolean> {
  const now = args.now ?? Date.now
  const timers = args.timers ?? {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }
  return new Promise<boolean>((resolve) => {
    let done = false
    let handle: unknown = null
    const finish = (v: boolean) => {
      if (done) return
      done = true
      if (handle !== null) timers.clear(handle)
      resolve(v)
    }
    const remaining = () => {
      const started = args.runStartedAt()
      return started === null ? 0 : Math.max(0, started + args.staleMs - now())
    }
    const arm = (ms: number) => {
      handle = timers.set(() => {
        handle = null
        const left = remaining()
        if (left > 0) arm(left)
        else finish(false)
      }, ms)
    }
    arm(remaining())
    void args.waitFor.then(finish, () => finish(false))
  })
}
