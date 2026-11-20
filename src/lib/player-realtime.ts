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
