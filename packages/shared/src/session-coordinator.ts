/**
 * Coordinates this device's saved player session with roster reads, so a stale roster can never
 * delete a session that a join just saved.
 *
 * The hazard: join() inserts the player row and only THEN saves the local session. A roster read that
 * started before the insert returns a roster without that player; if the session is saved while the
 * read is in flight, comparing the new session with the old roster would look like "the host removed
 * you" and drop a fresh seat.
 *
 * Rules enforced here:
 * - Every session save/clear runs through `mutate` (serialized), and bumps `epoch` before and after.
 * - A roster read is only trusted for cleanup if the epoch did not move while it ran; otherwise it is
 *   discarded and read again (bounded), and on exhaustion the session is kept (never cleared).
 * - The check-and-clear is one exclusive step (`clearIfStillMissing`): it re-reads the stored session
 *   and clears only if it is still the player that was found missing, and no save can interleave
 *   because saves are serialized with it.
 */
export function createSessionCoordinator() {
  let epoch = 0
  let tail: Promise<unknown> = Promise.resolve()

  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn)
    tail = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  return {
    epoch: () => epoch,
    /** Run a session save or clear. Serialized with every other mutation and conditional clear. */
    mutate<T>(fn: () => Promise<T>): Promise<T> {
      return exclusive(async () => {
        epoch += 1
        try {
          return await fn()
        } finally {
          epoch += 1
        }
      })
    },
    /**
     * Clear the stored session iff it is still `savedPlayerId` and no session change happened since
     * `readEpoch`. 'stale' = the epoch moved (the roster it was compared with is outdated),
     * 'replaced' = a different session is stored now, 'cleared' = cleared.
     */
    clearIfStillMissing(args: {
      readEpoch: number
      savedPlayerId: string
      readSession: () => Promise<{ playerId: string } | null>
      clear: () => Promise<void>
    }): Promise<'cleared' | 'stale' | 'replaced'> {
      return exclusive(async () => {
        if (epoch !== args.readEpoch) return 'stale'
        const current = await args.readSession()
        if (current?.playerId !== args.savedPlayerId) return 'replaced'
        epoch += 1
        try {
          await args.clear()
        } finally {
          epoch += 1
        }
        return 'cleared'
      })
    },
  }
}

export type SessionCoordinator = ReturnType<typeof createSessionCoordinator>

/**
 * Reads the saved session and the roster, and drops the session only if the SAME saved player is
 * absent from a roster read entirely after the session was last set. Returns null when the roster
 * read failed. Bounded: after `maxAttempts` overtaken reads it returns the freshest session without
 * clearing anything.
 */
export async function resolveSessionAgainstRoster<S extends { playerId: string }, R>(
  coordinator: SessionCoordinator,
  args: {
    readSession: () => Promise<S | null>
    /** null = the read failed. */
    readRoster: () => Promise<R | null>
    rosterHasPlayer: (roster: R, playerId: string) => boolean
    clear: () => Promise<void>
    maxAttempts?: number
  }
): Promise<{ session: S | null; roster: R } | null> {
  const { readSession, readRoster, rosterHasPlayer, clear, maxAttempts = 3 } = args
  let lastRoster: R | null = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const readEpoch = coordinator.epoch()
    // Session first: a session saved after the roster read began cannot be paired with it.
    const session = await readSession()
    const roster = await readRoster()
    if (roster === null) return null
    lastRoster = roster
    if (coordinator.epoch() !== readEpoch) continue // a session change overlapped the read: re-read
    if (!session || rosterHasPlayer(roster, session.playerId)) return { session, roster }
    const outcome = await coordinator.clearIfStillMissing({
      readEpoch,
      savedPlayerId: session.playerId,
      readSession,
      clear,
    })
    if (outcome === 'cleared') return { session: null, roster }
    if (outcome === 'replaced') return { session: await readSession(), roster }
    // 'stale': the epoch moved before the check; loop and read again
  }
  // Exhausted: keep whatever is stored now, never clear on an outdated roster.
  return { session: await readSession(), roster: lastRoster as R }
}
