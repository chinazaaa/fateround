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
 * goes through `request()`, so at most ONE `load` callback runs at a time and older reads can never
 * finish after newer ones. Nothing is superseded, so nothing hands its result or its retry to
 * someone else.
 *
 * State machine (all state is below; every transition is in `request`, `pump`, the retry timer, `stop`):
 *
 *   idle      no active attempt. A request starts one (retry budget reset).
 *   running   `active` = the attempt whose `load` call is in flight, with its own `waiters`.
 *   queued    `queued` = ONE follow-up attempt (own `waiters`) that starts as soon as `active` ends.
 *             Fresh requests, and requests from a newer start()/stop() generation, go here.
 *   retrying  a backoff `timer` is pending after a failed attempt; a request replaces it with an
 *             immediate attempt that inherits the retry ownership and the consumed budget.
 *   stopped   `gen` is bumped by `stop()`; waiters of every attempt are settled false at once, the
 *             in-flight callback is left to finish (callbacks stay serialized) and its result is
 *             ignored. `start()` re-arms; a request after it queues behind the still-running callback.
 *
 * Each request resolves with the outcome of the attempt that served it:
 * - plain request while running (same generation): joins `active` and shares its outcome
 * - fresh request while running: joins `queued` (a read that starts after the request)
 * - request while idle/retrying: starts its own attempt
 * A failed attempt schedules a bounded exponential-backoff retry when any requester of that attempt
 * asked for retry. A queued follow-up always starts a NEW retry budget (it is a new request); only
 * timer-started retries consume the budget. `load` returns false (or throws) on failure.
 */
export function createSerialLoader(
  load: () => Promise<boolean | void>,
  { maxRetries = 4, baseDelayMs = 1000, maxDelayMs = 8000 }: SerialLoaderOptions = {}
) {
  type Attempt = { gen: number; waiters: Array<(ok: boolean) => void>; retry: boolean }
  type Followup = { waiters: Array<(ok: boolean) => void>; retry: boolean }

  let gen = 0
  let stopped = false
  let active: Attempt | null = null
  let queued: Followup | null = null
  let retries = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  /** Runs attempts one after another until nothing is active. Only ever one `pump` loop at a time. */
  async function pump(): Promise<void> {
    while (active) {
      const attempt: Attempt = active
      let ok: boolean
      try {
        ok = (await load()) !== false
      } catch {
        ok = false
      }
      // stop() already settled this attempt's waiters (false) and bumped `gen`; a stale result is ignored.
      const current = attempt.gen === gen
      if (current) for (const resolve of attempt.waiters) resolve(ok)
      active = null
      if (queued) {
        // A follow-up is a new request: it gets its own retry budget.
        active = { gen, waiters: queued.waiters, retry: queued.retry }
        queued = null
        retries = 0
        continue
      }
      if (!current) break
      if (ok) {
        retries = 0
      } else if (attempt.retry && retries < maxRetries) {
        const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** retries)
        retries += 1
        timer = setTimeout(() => {
          timer = null
          if (stopped || active) return
          active = { gen, waiters: [], retry: true } // a timer-started retry keeps the budget it consumed
          void pump()
        }, delay)
      }
    }
  }

  return {
    /** (Re)arms the loader; effects call it first so a StrictMode cleanup-then-remount works. */
    start() {
      stopped = false
    },
    request({ fresh = false, retry = true }: SerialLoadRequest = {}): Promise<boolean> {
      if (stopped) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        if (!active) {
          // A pending backoff timer means an earlier requester owns recovery. The replacement attempt
          // inherits that ownership AND the budget already consumed, so a poll (retry: false) that
          // replaces the timer and fails does not end recovery, and the total stays bounded.
          const recovering = timer !== null
          clearTimer()
          if (!recovering) retries = 0
          active = { gen, waiters: [resolve], retry: retry || recovering }
          void pump()
          return
        }
        if (!fresh && active.gen === gen) {
          active.waiters.push(resolve)
          active.retry = active.retry || retry
          return
        }
        queued ??= { waiters: [], retry: false }
        queued.waiters.push(resolve)
        queued.retry = queued.retry || retry
      })
    },
    stop() {
      stopped = true
      gen += 1
      clearTimer()
      const dropped = [...(active?.waiters ?? []), ...(queued?.waiters ?? [])]
      if (active) active.waiters = []
      queued = null
      for (const resolve of dropped) resolve(false)
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
