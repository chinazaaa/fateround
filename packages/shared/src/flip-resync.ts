/** Handle for one flip request: `end` settles exactly the request (and round) that `begin` counted. */
export type FlipToken = { readonly round: string | null; ended: boolean }

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
export function createFlipResyncTracker(resync: () => Promise<unknown> | void) {
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

  const readMayBeStale = (ticket: ReadTicket, round: string | null) =>
    pendingIn(round) > 0 || (lastFlipEvent.get(round) ?? 0) > ticket.seq

  function maybeResync() {
    if (pendingIn(currentRound) !== 0 || !failed || resyncing) return
    failed = false
    resyncing = true
    const done = () => {
      resyncing = false
      maybeResync()
    }
    try {
      void Promise.resolve(resync()).then(done, done)
    } catch {
      done()
    }
  }

  return {
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
      currentRound = args.roundId
      if (lastBoardRound !== null && lastBoardRound !== args.roundId) {
        boardRound = lastBoardRound = args.roundId
        appliedSeq = args.ticket.seq
        // Work queued for the previous round (a deferred read, a failure to reload for) is moot now.
        deferred = false
        failed = false
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
      currentRound = roundId
    },
    /**
     * The view dropped its board (e.g. `roundId`, the new round, has none yet): nothing is owned any more.
     * The last applied round is remembered so that round's first board still counts as 'new-round'.
     */
    clearBoardRound(roundId?: string | null) {
      boardRound = null
      deferred = false
      if (roundId !== undefined) currentRound = roundId
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
      return { round, ended: false }
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
      const left = pendingIn(token.round) - 1
      if (left > 0) pending.set(token.round, left)
      else pending.delete(token.round)
      // A flip of a round the view has left cannot have made the current board stale.
      if (token.round !== currentRound) return
      if (didFail || deferred) failed = true
      deferred = false
      maybeResync()
    },
  }
}
