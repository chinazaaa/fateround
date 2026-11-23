/**
 * Platform-neutral core of the mobile "reconcile the stored player session against the roster" step
 * (apps/mobile/lib/player-session-reconcile.ts). Storage and network are injected so the race handling is
 * testable without SecureStore.
 *
 * THE RACE: the roster is read first, then the stored session, then the server is asked about the stored token
 * (a network round trip). A load that stalls for a while can be superseded in the meantime, and a newer load or a
 * join can save a NEWER session. The old load must not clear or re-key that newer session on the strength of an
 * outdated roster. Two guards:
 *  1. `isCurrent()` is checked after the probe: a superseded run writes nothing.
 *  2. Immediately before any write the stored session is read again; if it is no longer the exact session this run
 *     validated (different id/token, or gone), the run writes nothing and returns what is stored now.
 * Only a session saved inside the single re-read-to-write gap is invisible to this (SecureStore offers no
 * compare-and-set).
 */

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
  read: () => Promise<S | null>
  probe: (resumeToken: string) => Promise<ReconcileProbe<S>>
  write: (session: S) => Promise<void>
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
  const isCurrent = deps.isCurrent ?? (() => true)
  const session = await deps.read()
  if (!session) return null
  if (roster.some((p) => p.id === session.playerId)) return session
  if (!session.resumeToken) return session

  const result = await deps.probe(session.resumeToken)
  if (result.kind === 'unknown') return session
  // Superseded while the probe was in flight: a fresher load owns the stored session now.
  if (!isCurrent()) return session
  // Something else (a join, a rotate, a newer load) changed the stored session since we read it: it is newer
  // than the roster we validated against, so leave it alone and use it.
  const latest = await deps.read()
  if (!isCurrent()) return session
  if (!latest || !same(latest, session)) return latest

  if (result.kind === 'row') {
    if (result.session.playerId !== session.playerId) await deps.write(result.session)
    return result.session
  }
  await deps.clear()
  return null
}
