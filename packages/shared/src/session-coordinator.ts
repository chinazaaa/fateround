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
export function createSessionCoordinator(startEpoch = 0) {
  let epoch = startEpoch
  let pending = 0
  let tail: Promise<unknown> = Promise.resolve()

  function exclusive<T>(fn: () => Promise<T>): Promise<T> {
    pending += 1
    const run = tail.then(fn, fn)
    const settled = () => {
      pending -= 1
    }
    tail = run.then(settled, settled)
    return run
  }

  return {
    epoch: () => epoch,
    /** True when no save, clear or check is queued or running. */
    idle: () => pending === 0,
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
      /** Checked inside the exclusive step: false (e.g. the view unmounted) makes the clear a no-op. */
      proceed?: () => boolean
    }): Promise<'cleared' | 'stale' | 'replaced' | 'skipped'> {
      return exclusive(async () => {
        if (args.proceed && !args.proceed()) return 'skipped'
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
    /** False (e.g. unmounted) makes any clear a no-op. */
    proceed?: () => boolean
    maxAttempts?: number
  }
): Promise<{ session: S | null; roster: R } | null> {
  const { readSession, readRoster, rosterHasPlayer, clear, proceed, maxAttempts = 3 } = args
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
      proceed,
    })
    if (outcome === 'cleared') return { session: null, roster }
    if (outcome === 'replaced' || outcome === 'skipped') return { session: await readSession(), roster }
    // 'stale': the epoch moved before the check; loop and read again
  }
  // Exhausted: keep whatever is stored now, never clear on an outdated roster.
  return { session: await readSession(), roster: lastRoster as R }
}

// One coordinator per room, shared by every view instance and every session writer in the process, so
// an old (unmounting) view's pending clear and a new view's or a join flow's save serialize against
// each other. Entries are kept (a few bytes each) and only evicted when idle and the registry is
// large; an evicted room's epoch becomes the floor for later coordinators so epochs never go
// backwards and an in-flight comparison cannot be fooled by a recreated coordinator.
const MAX_ROOMS = 64
const registry = new Map<string, SessionCoordinator>()
let epochFloor = 0

export function getSessionCoordinator(room: string): SessionCoordinator {
  const key = room.toUpperCase()
  let coordinator = registry.get(key)
  if (!coordinator) {
    if (registry.size >= MAX_ROOMS) {
      for (const [k, c] of registry) {
        if (!c.idle()) continue
        epochFloor = Math.max(epochFloor, c.epoch())
        registry.delete(k)
        if (registry.size < MAX_ROOMS) break
      }
    }
    coordinator = createSessionCoordinator(epochFloor)
    registry.set(key, coordinator)
  }
  return coordinator
}

/** Test helper: forget every room's coordinator. */
export function resetSessionCoordinatorsForTests(): void {
  registry.clear()
  epochFloor = 0
}
