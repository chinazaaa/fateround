/**
 * Stale-replica guard for a game that finished. `start` only moves a game to 'active' from 'waiting' with a NEW
 * session_started_at, so a later read showing the SAME session as 'active' can only be read-replica lag: ignore
 * it so results never bounce back to the board. A real replay passes through 'waiting', which clears the latch.
 *
 * The latch is set the moment a finished read is seen, but the finished screen is only selected after the rest
 * of that load (state loading, `afterResolve`) has run, and either can stall or fail. Until the run that saw the
 * finished game actually selects a screen the session counts as UNPUBLISHED: a stale 'active' read of that
 * session then reports failure (so a caller that owns a retry reads again) instead of success, without
 * publishing the stale active board.
 */
export function createFinishedLatch() {
  let session: string | null | undefined = undefined
  let unpublished = false

  return {
    /**
     * Classify a game row. `'stale-active'`: an 'active' read of the session that already finished (drop it,
     * and report `staleResult()`). Otherwise `'ok'`, after updating the latch: a finished row latches its session
     * as unpublished; a waiting row (a real replay) clears everything.
     */
    observe(status: string, sessionStartedAt: string | null | undefined): 'ok' | 'stale-active' {
      const started = sessionStartedAt ?? null
      if (session !== undefined && status === 'active' && started === session) return 'stale-active'
      if (status === 'finished') {
        session = started
        unpublished = true
      } else if (status === 'waiting') {
        session = undefined
        unpublished = false
      }
      return 'ok'
    },
    /** What a load that dropped a stale-active read reports: failed while the finished screen was never selected. */
    staleResult: () => !unpublished,
    /** The run that observed the finished game selected its screen: nothing is owed any more. */
    published() {
      unpublished = false
    },
    reset() {
      session = undefined
      unpublished = false
    },
    /** For tests. */
    unpublished: () => unpublished,
  }
}
