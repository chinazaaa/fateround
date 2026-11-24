/**
 * Platform-neutral core of the mobile "reconcile the stored player session against the roster" step
 * (apps/mobile/lib/player-session-reconcile.ts). Storage and network are injected so the race handling is
 * testable without SecureStore.
 *
 * THE RACE: the roster is read first, then the stored session, then the server is asked about the stored token
 * (a network round trip). A load that stalls for a while can be superseded in the meantime, and a newer load or a
 * join can save a NEWER session. The old load must not clear or re-key that newer session on the strength of an
 * outdated roster. A join save that is merely IN PROGRESS (queued or running in the room's coordinator, not yet
 * visible in storage) is the nastiest form: reading storage cannot see it, so a plain re-read would still find
 * the old token and queue a clear that runs right after the join and deletes the new seat.
 *
 * So the decision to write is made INSIDE the room's coordinator (session-coordinator.ts), in one exclusive step
 * that is serialized with every save and clear:
 *  1. the coordinator epoch read before this run read the session must be unchanged (a save or clear that
 *     started, finished or is still running since then makes this run's validation outdated);
 *  2. the stored session is read again and must still be the exact id/token validated (it also covers a
 *     coordinator-less writer);
 *  3. `isCurrent()` is checked there too (a superseded run writes nothing).
 * If any check fails nothing is written and what is stored now is returned. The raw `write` / `clear` deps run
 * inside the step, so they must NOT go through the coordinator-routed setters.
 */
import type { SessionCoordinator } from './session-coordinator'

export interface ReconcilableSession {
  playerId: string
  resumeToken: string | null
}

export type ReconcileProbe<S extends ReconcilableSession> =
  | { kind: 'row'; session: S }
  /** The server positively reports the token gone (404). */
  | { kind: 'gone' }
  /** Unverifiable (network, 5xx, 429...): never clear. */
  | { kind: 'unknown' }

export interface ReconcileDeps<S extends ReconcilableSession> {
  /** The room's coordinator: the same one every session save/clear of this room goes through. */
  coordinator: SessionCoordinator
  read: () => Promise<S | null>
  probe: (resumeToken: string) => Promise<ReconcileProbe<S>>
  /** RAW save, run inside the coordinator's exclusive step. */
  write: (session: S) => Promise<void>
  /** RAW clear, run inside the coordinator's exclusive step. */
  clear: () => Promise<void>
  /** False once this run has been superseded or unmounted. */
  isCurrent?: () => boolean
}

const same = (a: ReconcilableSession, b: ReconcilableSession) =>
  a.playerId === b.playerId && a.resumeToken === b.resumeToken

export async function reconcileSession<S extends ReconcilableSession>(
  roster: readonly { id: string }[],
  deps: ReconcileDeps<S>
): Promise<S | null> {
  const { coordinator } = deps
  const isCurrent = deps.isCurrent ?? (() => true)
  // Before the read: a save already running now has bumped the epoch, so it counts as "changed since".
  const readEpoch = coordinator.epoch()
  const session = await deps.read()
  if (!session) return null
  if (roster.some((p) => p.id === session.playerId)) return session
  if (!session.resumeToken) return session

  const result = await deps.probe(session.resumeToken)
  if (result.kind === 'unknown') return session
  // Superseded while the probe was in flight: a fresher load owns the stored session now.
  if (!isCurrent()) return session

  return coordinator.exclusiveStep(async (step) => {
    if (!isCurrent()) return session
    // A save or clear ran, or is running, since this run read the session: the stored session is newer than the
    // roster and the probe it was validated with. Leave it alone and use it.
    if (step.epoch() !== readEpoch) return deps.read()
    const latest = await deps.read()
    if (!isCurrent()) return session
    if (!latest || !same(latest, session)) return latest

    if (result.kind === 'row') {
      if (result.session.playerId !== session.playerId) await step.commit(() => deps.write(result.session))
      return result.session
    }
    await step.commit(deps.clear)
    return null
  })
}
