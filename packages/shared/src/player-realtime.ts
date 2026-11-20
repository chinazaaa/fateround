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
