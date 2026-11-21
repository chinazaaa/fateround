// Keep byte-identical to src/lib/player-realtime.ts (web does not wire the @fateround/shared alias); a parity test enforces it.

export type PlayerChange<T extends { id: string }> =
  | { eventType: 'INSERT'; new: T }
  | { eventType: 'UPDATE'; new: T }
  | { eventType: 'DELETE'; old: { id: string } }

/**
 * Applies one realtime `players` row change to a roster. INSERT adds (idempotently), UPDATE merges
 * the changed fields into the matching row (an UPDATE for a row we never saw, e.g. a missed INSERT,
 * adds it), DELETE removes. UPDATE matters because a viewer readying up flips `spectator`, which
 * changes seat and participant counts without any INSERT or DELETE.
 */
export function applyPlayerChange<T extends { id: string }>(players: T[], change: PlayerChange<T>): T[] {
  if (change.eventType === 'DELETE') return players.filter((p) => p.id !== change.old.id)
  const row = change.new
  const exists = players.some((p) => p.id === row.id)
  if (change.eventType === 'INSERT') return exists ? players : [...players, row]
  return exists ? players.map((p) => (p.id === row.id ? { ...p, ...row } : p)) : [...players, row]
}

/**
 * Guards a roster snapshot read against realtime player events that land while the read is in flight.
 * Call `noteEvent()` whenever an event (or a local optimistic change) touches the roster, and wrap
 * the fetch in `read()`. A read that started before the latest event may carry rows the event has
 * already superseded (e.g. `spectator` flipped by a ready-up), so it is discarded and re-fetched; the
 * fresh read starts after the event, so it cannot be older than it. After `maxAttempts` consecutive
 * discards `read()` resolves null (event storm) and the caller keeps its event-built roster until the
 * next poll or event-driven read.
 */
export function createRosterReadGuard(maxAttempts = 3) {
  let epoch = 0
  return {
    noteEvent() {
      epoch += 1
    },
    async read<T>(fetch: () => Promise<T | null>): Promise<T | null> {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const startedAt = epoch
        const result = await fetch()
        if (result === null) return null
        if (epoch === startedAt) return result
      }
      return null
    },
  }
}

export type SerialLoaderOptions = {
  /** Retries after a failed attempt when the requester asked for retry. Bounded. */
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

export type SerialLoadRequest = {
  /**
   * The caller needs a read that STARTS AFTER this call (a realtime event, a join, a session change).
   * If a load is in flight it is followed by one more; without it, the caller shares the in-flight
   * read's result.
   */
  fresh?: boolean
  /** Retry a failed attempt with bounded backoff. Default true; a poll that backs off itself passes false. */
  retry?: boolean
}

/**
 * The single owner of a view's load. Every caller (initial load, realtime event, poll, resume, join)
 * goes through `request()`, so at most ONE load runs at a time and older reads can never finish after
 * newer ones. That removes the whole "superseded load" class of bugs: nothing is superseded, so
 * nothing needs to hand its result or its retry to someone else.
 *
 * - `request()` resolves with the outcome of the attempt that served it (true on success, false on a
 *   failed attempt or after `stop()`), never waiting out scheduled retries.
 * - A failed attempt schedules a bounded exponential-backoff retry when any requester in the cycle
 *   asked for retry; a later request cancels the pending retry and loads immediately.
 * - `stop()` (effect cleanup) cancels the pending retry, and no load starts or retries afterwards
 *   until `start()` re-arms it.
 * `load` returns false (or throws) on failure.
 */
export function createSerialLoader(
  load: () => Promise<boolean | void>,
  { maxRetries = 4, baseDelayMs = 1000, maxDelayMs = 8000 }: SerialLoaderOptions = {}
) {
  let stopped = false
  let running = false
  let rerun = false
  let wantsRetry = false
  let retries = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let waiters: Array<(ok: boolean) => void> = []

  function settle(ok: boolean) {
    const done = waiters
    waiters = []
    for (const resolve of done) resolve(ok)
  }

  async function run(): Promise<void> {
    running = true
    let ok: boolean
    do {
      rerun = false
      try {
        ok = (await load()) !== false
      } catch {
        ok = false
      }
    } while (rerun && !stopped)
    running = false
    if (stopped) {
      settle(false)
      return
    }
    if (ok) {
      retries = 0
    } else if (wantsRetry && retries < maxRetries) {
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** retries)
      retries += 1
      timer = setTimeout(() => {
        timer = null
        if (stopped || running) return
        wantsRetry = true // a retry cycle keeps retrying until the bound
        void run()
      }, delay)
    }
    wantsRetry = false
    settle(ok)
  }

  return {
    /** (Re)arms the loader; effects call it first so a StrictMode cleanup-then-remount works. */
    start() {
      stopped = false
    },
    request({ fresh = false, retry = true }: SerialLoadRequest = {}): Promise<boolean> {
      if (stopped) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        waiters.push(resolve)
        wantsRetry = wantsRetry || retry
        if (running) {
          if (fresh) rerun = true
          return
        }
        if (timer) clearTimeout(timer)
        timer = null
        retries = 0
        void run()
      })
    },
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
      if (!running) settle(false)
    },
  }
}

/**
 * Newest-call token for overlapping async loads. `begin()` starts a call and returns its
 * `superseded()` check: true once a later `begin()` happened. A load checks it after every await
 * and stops writing state when superseded, so an older response cannot overwrite a newer one. A
 * superseded load should report success: the newer load owns the result.
 */
export function createNewestCallTracker() {
  let latest = 0
  return {
    begin(): () => boolean {
      const mine = ++latest
      return () => mine !== latest
    },
  }
}

/**
 * Latest-wins applier for a feed loaded by overlapping async reads (poll, realtime event, resume).
 * `run(fetch, apply)` starts a read; if a newer `run` started before this one's fetch resolved, the
 * older result is dropped without calling `apply`, so a slow old response cannot overwrite a newer
 * feed. Resolves 'applied' when `apply` ran, 'superseded' when a newer `run` started first (whether
 * this read succeeded or failed: it is obsolete either way), and 'failed' when this is still the
 * newest read and its fetch returned null (a read error), so only a current failure is reported.
 */
export function createLatestResultApplier() {
  const tracker = createNewestCallTracker()
  return async function run<T>(
    fetch: () => Promise<T | null>,
    apply: (value: T) => void
  ): Promise<'applied' | 'superseded' | 'failed'> {
    const superseded = tracker.begin()
    const value = await fetch()
    if (superseded()) return 'superseded'
    if (value === null) return 'failed'
    apply(value)
    return 'applied'
  }
}
