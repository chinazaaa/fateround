import { READ_RETRY_DELAYS_MS } from './read-retry'

/** Handle for one flip request: `end` settles exactly the request (and round) that `begin` counted. */
export type FlipToken = {
  readonly round: string | null
  /** `cancel()` epoch the flip began in: a flip that settles after a later `cancel()` never starts a resync. */
  readonly epoch: number
  ended: boolean
}

/**
 * Handle for one snapshot read, from `startRead()`. `seq` orders it against every flip begin/settle and
 * every applied snapshot.
 */
export type ReadTicket = { readonly seq: number }

/**
 * Counts flip requests in flight, per round, and calls `resync` once the last flip of the current round
 * settles if any of them failed. A refused flip leaves the optimistic board ahead of what the server stored;
 * resyncing only after the others settle avoids rolling back a flip whose request has not been answered yet.
 *
 * Pending flips are scoped to the round that started them (`begin(roundId)` returns a token, `end(token,
 * failed)` settles it). A flip from a previous round can stay unanswered for a long time (the request has no
 * timeout) and must neither block the new round's snapshots nor have its completion decrement the new round's
 * count. A failure of a previous round's flip cannot make the current board stale, so it does not resync.
 *
 * `resync` may be async and reports its outcome: a resolved `false` or a rejection means the read behind it
 * failed (e.g. the game/players query errored before any snapshot was evaluated), so the tracker keeps the
 * resync owed and runs it again after the next backoff delay (`retryDelaysMs`, bounded; the budget is
 * restored by a successful resync, a new round or `cancel()`). Pass a resync that reads the real outcome of
 * the load it waits for (a read that joins one already in flight must not report an early `true`).
 *
 * `resync` may be async. A flip that starts while a resync is still reading would be hidden by the snapshot
 * that read produces, so it marks another resync to run after that read has finished and the flip has
 * settled.
 *
 * Whoever applies a snapshot calls `startRead()` before it reads and passes the ticket to `evaluateSnapshot`
 * (or `superseded` / `readMayBeStale` / `commitRead`). A read is rejected when a flip of its round began OR
 * SETTLED after the read started (it may have read before the flip committed, so it can lack a flip the
 * player already sees even though nothing is pending any more), or while one is pending; the follow-up read
 * is guaranteed to start after it. A read is also discarded outright when a newer read has been applied
 * since it started, so a slow read for an older round cannot overwrite a newer board. Flips of other rounds
 * do not invalidate a round's reads.
 */
export function createFlipResyncTracker(
  resync: () => Promise<unknown> | void,
  retryDelaysMs: readonly number[] = READ_RETRY_DELAYS_MS,
  timers: {
    set: (fn: () => void, ms: number) => unknown
    clear: (handle: unknown) => void
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }
) {
  const pending = new Map<string | null, number>()
  const pendingIn = (round: string | null) => pending.get(round) ?? 0
  let failed = false
  let resyncing = false
  let deferred = false
  /** Logical clock: advanced by every read start, flip begin/settle and applied snapshot. */
  let clock = 0
  /** Clock value of the last flip begin/settle of each round. */
  const lastFlipEvent = new Map<string | null, number>()
  /** `seq` of the newest read whose snapshot was applied. Older reads are superseded. */
  let appliedSeq = 0
  /** Round the view is on: the latest one evaluated (or found boardless). Only its flips gate a resync. */
  let currentRound: string | null = null
  /** Round whose board the view currently shows. */
  let boardRound: string | null = null
  /**
   * Round of the last board that was applied. Unlike `boardRound` it survives `clearBoardRound`, so the first
   * board of a round that had none yet is still recognised as a new round.
   */
  let lastBoardRound: string | null = null

  /** Failed resyncs since the last success, and the pending backoff timer (no resync runs before it fires). */
  let failedAttempts = 0
  let backoff: { handle: unknown } | null = null
  /** Bumped by `cancel()`: the outcome of a resync that started before it is ignored. */
  let epoch = 0

  const clearBackoff = () => {
    if (backoff) timers.clear(backoff.handle)
    backoff = null
  }

  /**
   * The view moved to another round: retry debt owed for the previous round (a failed flip, a deferred read, a
   * backoff timer) is moot. Left set, the timer would fire and `maybeResync()` would start a pointless load of
   * the new round, and the debt would survive a successful snapshot of it.
   */
  const dropRetryDebt = () => {
    deferred = false
    failed = false
    failedAttempts = 0
    clearBackoff()
  }
  const moveToRound = (roundId: string | null) => {
    if (roundId !== currentRound) dropRetryDebt()
    currentRound = roundId
  }

  const readMayBeStale = (ticket: ReadTicket, round: string | null) =>
    pendingIn(round) > 0 || (lastFlipEvent.get(round) ?? 0) > ticket.seq

  function maybeResync() {
    if (pendingIn(currentRound) !== 0 || !failed || resyncing || backoff) return
    failed = false
    resyncing = true
    const round = currentRound
    const started = epoch
    const done = (ok: boolean) => {
      resyncing = false
      if (epoch === started) {
        if (ok) {
          failedAttempts = 0
        } else if (round === currentRound) {
          if (failedAttempts < retryDelaysMs.length) {
            // The read itself failed, so the board is still stale: owe another resync after a backoff.
            failed = true
            const mine: { handle: unknown } = { handle: null }
            mine.handle = timers.set(() => {
              if (backoff === mine) backoff = null
              maybeResync()
            }, retryDelaysMs[failedAttempts]!)
            backoff = mine
            failedAttempts++
          } else {
            // Budget used up: stop; the next flip failure or snapshot request starts afresh.
            failedAttempts = 0
          }
        }
      }
      maybeResync()
    }
    try {
      void Promise.resolve(resync()).then(
        (v) => done(v !== false),
        () => done(false)
      )
    } catch {
      done(false)
    }
  }

  return {
    /** Unmount: drop a pending backoff timer and the outcome of a resync still running. Reusable afterwards. */
    cancel() {
      epoch++
      // Flips that began before this are no longer part of the recovery gate: one that never gets an answer
      // would hold every later resync back forever, and one that settles late must not decrement the count of a
      // flip started AFTER the cancel (the count is per round, not per flip). `end` ignores their decrement.
      pending.clear()
      failed = false
      deferred = false
      failedAttempts = 0
      clearBackoff()
    },
    /** Round whose board the view currently shows (set by `evaluateSnapshot` when it says to apply). */
    boardRound: () => boardRound,
    /**
     * Decide what to do with a snapshot of `roundId`. A selection, flip-back or unanswered flip belongs to
     * the round that owns the board, so it is only preserved when the snapshot is for that same round. For
     * another round the snapshot is applied outright ('new-round': the caller must also cancel pending
     * flip-back work and start that round's memorize preview) and stale deferred work is dropped.
     * Otherwise: 'apply', 'keep-dirty' (selecting; read again when it ends) or 'keep-resync'.
     */
    evaluateSnapshot(args: {
      roundId: string
      ticket: ReadTicket
      selecting: boolean
    }): 'apply' | 'new-round' | 'keep-dirty' | 'keep-resync' | 'discard' {
      // A newer read was applied since this one started: drop it without touching any state.
      if (args.ticket.seq < appliedSeq) return 'discard'
      moveToRound(args.roundId)
      if (lastBoardRound !== null && lastBoardRound !== args.roundId) {
        // The previous round's selection and unanswered flips are overridden, but the INCOMING round's own flips
        // still count: one unanswered (or settled after this read began) means the snapshot may lack a flip the
        // player already sees, so it must not be applied; read again once those have settled.
        if (readMayBeStale(args.ticket, args.roundId)) {
          failed = true
          maybeResync()
          return 'keep-resync'
        }
        boardRound = lastBoardRound = args.roundId
        appliedSeq = args.ticket.seq
        // Work queued for the previous round (a deferred read, a failure to reload for) is moot now.
        dropRetryDebt()
        return 'new-round'
      }
      if (readMayBeStale(args.ticket, args.roundId) || args.selecting) {
        if (args.selecting) deferred = true
        else {
          failed = true
          maybeResync()
        }
        return args.selecting ? 'keep-dirty' : 'keep-resync'
      }
      boardRound = lastBoardRound = args.roundId
      appliedSeq = args.ticket.seq
      return 'apply'
    },
    /**
     * For a view that decides apply/skip itself instead of calling `evaluateSnapshot`: tell the tracker which
     * round a snapshot is for, so only that round's flips gate resyncs.
     */
    enterRound(roundId: string | null) {
      moveToRound(roundId)
    },
    /**
     * The view dropped its board (e.g. `roundId`, the new round, has none yet): nothing is owned any more.
     * The last applied round is remembered so that round's first board still counts as 'new-round'.
     *
     * Retiring a board also advances the read fence: a read that started earlier (a stalled read of the round
     * the board belonged to) must not come back later and rebuild it. With `ticket` (the read that retires
     * the board) that read itself stays valid; without one, every read started so far is fenced.
     */
    clearBoardRound(roundId?: string | null, ticket?: ReadTicket) {
      boardRound = null
      deferred = false
      if (roundId !== undefined) moveToRound(roundId)
      const fence = ticket ? ticket.seq : ++clock
      if (fence > appliedSeq) appliedSeq = fence
    },
    /**
     * Count a flip request of `roundId` (default: the round the view is on). Pass the returned token to
     * `end` when that request settles.
     */
    begin(roundId?: string | null): FlipToken {
      const round = roundId === undefined ? currentRound : roundId
      pending.set(round, pendingIn(round) + 1)
      lastFlipEvent.set(round, ++clock)
      if (resyncing && round === currentRound) failed = true
      return { round, epoch, ended: false }
    },
    /** Call right before a snapshot read starts; pass the ticket to `evaluateSnapshot`. */
    startRead(): ReadTicket {
      return { seq: ++clock }
    },
    /** True when a newer read was applied since this one started (apply nothing, change nothing). */
    superseded: (ticket: ReadTicket) => ticket.seq < appliedSeq,
    /**
     * For a view that decides apply/skip itself: true while a flip of `roundId` is unanswered, or one began
     * or settled after the read started, so the snapshot may lack a flip the player already sees.
     */
    readMayBeStale: (ticket: ReadTicket, roundId: string | null) => readMayBeStale(ticket, roundId),
    /** For a view that decides apply/skip itself: the snapshot of this read was applied. */
    commitRead(ticket: ReadTicket) {
      if (ticket.seq > appliedSeq) appliedSeq = ticket.seq
    },
    /**
     * True while a flip request of the round (default: the one the view is on) is unanswered, so a snapshot
     * may lack a flip the player already sees. Flips of other rounds do not count.
     */
    inFlight: (roundId?: string | null) => pendingIn(roundId === undefined ? currentRound : roundId) > 0,
    /**
     * A snapshot was skipped because a card is selected or flipping back, so there is nothing to read until
     * that ends. Unlike `requestResync` this never triggers a read by itself (a read that finds the same
     * selection would just repeat); `flushDeferred()` or the next flip to settle does.
     */
    markDirty() {
      deferred = true
    },
    /** The selection ended (flip-back finished): read now if a snapshot was deferred. */
    flushDeferred() {
      if (!deferred) return
      deferred = false
      failed = true
      maybeResync()
    },
    /** Resync (again) once nothing is in flight; for a snapshot that was not applied because it could be stale. */
    requestResync() {
      failed = true
      maybeResync()
    },
    /**
     * The request behind `token` settled. Settling twice, or a flip of an earlier round, never touches another
     * round's count.
     */
    end(token: FlipToken, didFail: boolean) {
      if (token.ended) return
      token.ended = true
      // A read that started before this settled may have read before the flip committed.
      lastFlipEvent.set(token.round, ++clock)
      // The view was cancelled (unmounted) after this flip began: `cancel()` already dropped it from the count
      // (decrementing now would eat a replacement flip's), and a flip that settles that late must not start a
      // load (which could arm a backoff timer after unmount).
      if (token.epoch !== epoch) return
      const left = pendingIn(token.round) - 1
      if (left > 0) pending.set(token.round, left)
      else pending.delete(token.round)
      // A flip of a round the view has left cannot have made the current board stale.
      if (token.round !== currentRound) return
      if (didFail || deferred) failed = true
      // A flip that just failed is fresh evidence the board is stale: do not wait out a backoff for it.
      if (didFail) clearBackoff()
      deferred = false
      maybeResync()
    },
  }
}

/**
 * True only when every Supabase read of a snapshot succeeded. A failed read comes back as `{ data: null,
 * error }`; applying it as "no rows" would hide stored matches and reset points and streak. A snapshot with a
 * failed read must not be applied or committed (`commitRead`): keep the current board and let a later event,
 * poll or flip settle read again. A SUCCESSFUL empty result is real empty history and is still applied.
 */
export function snapshotReadsOk(
  ...results: ReadonlyArray<{ data?: unknown; error?: unknown } | null | undefined>
): boolean {
  return results.every((r) => !!r && !r.error)
}
