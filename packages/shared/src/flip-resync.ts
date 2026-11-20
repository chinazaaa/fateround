/**
 * Counts flip requests in flight and calls `resync` once the last one settles if any of them failed. A
 * refused flip leaves the optimistic board ahead of what the server stored; resyncing only after the others
 * settle avoids rolling back a flip whose request has not been answered yet.
 *
 * `resync` may be async. A flip that starts while a resync is still reading would be hidden by the snapshot
 * that read produces, so it marks another resync to run after that read has finished and the flip has
 * settled.
 *
 * Whoever applies a snapshot should skip the optimistic state (board, streak, points) when
 * `inFlight()` or when `epoch()` moved since its read started, and call `requestResync()` instead: that read
 * may predate a flip the player already sees, and the follow-up read is guaranteed to start after it.
 */
export function createFlipResyncTracker(resync: () => Promise<unknown> | void) {
  let pending = 0
  let failed = false
  let resyncing = false
  let deferred = false

  function maybeResync() {
    if (pending !== 0 || !failed || resyncing) return
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

  let epoch = 0

  return {
    begin() {
      pending += 1
      epoch += 1
      if (resyncing) failed = true
    },
    /** Counts every flip started so far. A snapshot read that began at an older epoch may predate a flip. */
    epoch: () => epoch,
    /** True while any flip request is unanswered, so a snapshot may lack a flip the player already sees. */
    inFlight: () => pending > 0,
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
    end(didFail: boolean) {
      if (didFail || deferred) failed = true
      deferred = false
      pending = Math.max(0, pending - 1)
      maybeResync()
    },
  }
}
