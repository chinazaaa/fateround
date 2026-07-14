import type { Player } from '@/types'

/**
 * W5 scalability: the auto-advance / bingo-sync pollers POST to their `advance`
 * endpoint on an interval from *every* connected client, so rounds keep
 * progressing even if the host tab is backgrounded (deliberate resilience — the
 * server side is idempotent and any client may drive it). At scale that is N
 * identical POSTs per tick plus N full reloads, i.e. O(players) redundant load
 * on a 40-player party game.
 *
 * Rather than collapse to a single host-only driver (which reintroduces the very
 * single-point-of-failure the all-client design avoids — a backgrounded/closed
 * host would stall the game), we elect a small, deterministic quorum of clients
 * to actually poll. The set is computed identically on every client from the
 * shared `players` array, so exactly `DRIVER_QUORUM` players drive; if one drops
 * the array changes and the next-eligible player is elected automatically. The
 * host, when it drives at all, is always a driver on top of the quorum.
 *
 * This cuts the fan-out from O(players) to O(1) while keeping ≥2 independent
 * drivers with automatic failover — the safety-net reconciliation poll remains
 * the ultimate backstop if every driver drops at once.
 */
export const DRIVER_QUORUM = 2

/**
 * Whether this client should run an auto-advance / bingo-sync poll.
 *
 * @param players     the game's players (any order — a stable total order is
 *                    imposed internally so all clients agree)
 * @param myPlayerId  this client's player id, or null/undefined for a client
 *                    with no seat (never an elected player-driver)
 * @param opts.isHost pass `true` from host views — the host always drives
 */
export function isAdvanceDriver(
  players: readonly Player[],
  myPlayerId: string | null | undefined,
  opts?: { isHost?: boolean }
): boolean {
  if (opts?.isHost) return true
  if (!myPlayerId) return false

  const drivers = [...players]
    .filter((p) => p.spectator !== true && p.is_eliminated !== true)
    // Deterministic total order by (joined_at, id) so every client elects the
    // same quorum regardless of how its local array happens to be sorted.
    .sort((a, b) => {
      const ja = a.joined_at ?? ''
      const jb = b.joined_at ?? ''
      if (ja !== jb) return ja < jb ? -1 : 1
      return a.id < b.id ? -1 : 1
    })
    .slice(0, DRIVER_QUORUM)

  return drivers.some((p) => p.id === myPlayerId)
}
