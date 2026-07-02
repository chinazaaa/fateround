// Head-to-head bracket helpers: seeding into matches, byes, and round labels.
// Pure functions so the pairing/bye math can be unit-tested independently of the
// round-spawn endpoint (which handles shuffling + I/O).

// Games eligible for the head-to-head (bracket) format. Chess is the classic 1v1
// (group size 2); Whot and Scrabble play in rooms of 4, where each round's single
// room winner advances (group size 4). All are single-winner elimination games.
// Kept here (a dependency-free module) so the resolution libs can read the room
// size without importing the schema file, which would form an import cycle.
export const H2H_ELIGIBLE_TYPES = ['chess', 'whot', 'scrabble'] as const

// How many players share one bracket room per game. Chess is a duel; Whot and
// Scrabble seat 4 and advance only the room winner. Drives the round grouping,
// seating, and elimination math.
export const H2H_GROUP_SIZES: Record<(typeof H2H_ELIGIBLE_TYPES)[number], number> = {
  chess: 2,
  whot: 4,
  scrabble: 4,
}

/** Room size for a head-to-head game type; defaults to a duel (2) if unknown. */
export function h2hGroupSize(gameType: string | null | undefined): number {
  return H2H_GROUP_SIZES[gameType as (typeof H2H_ELIGIBLE_TYPES)[number]] ?? 2
}

/** Smallest power of two >= n (minimum 1). */
export function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return p
}

export interface RoundPairing {
  /** Pairs of player ids that play a match this round. */
  matches: [string, string][]
  /** Player ids that skip this round and advance automatically. */
  byes: string[]
}

/**
 * Pair an already-seeded list of survivor ids into matches for one bracket
 * round. Everyone who has an opponent plays — only the odd one out (when the
 * count is odd) gets a bye and advances automatically. So an even field is all
 * matches and no byes (6 players → 3 games); an odd field is one bye plus the
 * rest paired. Byes recur naturally in later rounds whenever the survivor count
 * is odd, at most one per round.
 *
 * `avoidByeIds` are players who got a bye last round — when the field is odd the
 * bye goes to someone else if possible, so nobody sits out twice in a row.
 */
export function computeRoundPairings(seededIds: string[], avoidByeIds: string[] = []): RoundPairing {
  const n = seededIds.length
  if (n <= 1) return { matches: [], byes: [...seededIds] }

  let byes: string[] = []
  let playing = seededIds

  if (n % 2 === 1) {
    const avoid = new Set(avoidByeIds)
    // Prefer to bye someone who didn't get one last round; the list is already
    // shuffled, so scanning from the end is effectively a random eligible pick.
    let byeIdx = seededIds.length - 1
    for (let i = seededIds.length - 1; i >= 0; i--) {
      if (!avoid.has(seededIds[i])) {
        byeIdx = i
        break
      }
    }
    byes = [seededIds[byeIdx]]
    playing = seededIds.filter((_, i) => i !== byeIdx)
  }

  const matches: [string, string][] = []
  for (let i = 0; i + 1 < playing.length; i += 2) {
    matches.push([playing[i], playing[i + 1]])
  }
  return { matches, byes }
}

export interface RoundGroups {
  /** Groups of player ids that each play one game this round; the winner advances. */
  groups: string[][]
  /** Player ids that skip this round and advance automatically (a lone leftover). */
  byes: string[]
}

/**
 * Split an already-seeded list of survivor ids into groups for one round of a
 * *group bracket* — the group-of-N generalisation of head-to-head (chess is the
 * N=2 case). Everyone in a group plays one game (Whot/Scrabble) and only its
 * single winner advances; the rest are eliminated. So a round of N groups yields
 * N winners, converging to a champion (16 → 4 groups → 4 → 1 group → 1).
 *
 * Rooms hold up to `groupSize` players, but the field is spread as *evenly* as
 * possible across ceil(n / groupSize) rooms rather than packing full rooms and
 * leaving a lopsided remainder — 6 players at size 4 become two rooms of 3, not
 * a 4 and a 2, so nobody gets a materially easier path. A room that would hold a
 * single player instead becomes a bye (only reachable at group size 2; the
 * fixed size-4 formats never produce one). A lone survivor byes to the next round.
 */
export function computeRoundGroups(seededIds: string[], groupSize: number): RoundGroups {
  const size = Math.max(2, Math.floor(groupSize) || 2)
  const n = seededIds.length
  if (n <= 1) return { groups: [], byes: [...seededIds] }

  const numGroups = Math.ceil(n / size)
  const base = Math.floor(n / numGroups)
  // The first `remainder` groups get one extra player, so sizes differ by at most 1.
  const remainder = n % numGroups

  const built: string[][] = []
  let idx = 0
  for (let g = 0; g < numGroups; g++) {
    const thisSize = base + (g < remainder ? 1 : 0)
    built.push(seededIds.slice(idx, idx + thisSize))
    idx += thisSize
  }

  // A size-1 room isn't a game — fold any into byes so every group has ≥ 2 players.
  const groups = built.filter((g) => g.length >= 2)
  const byes = built.filter((g) => g.length === 1).flat()
  return { groups, byes }
}

/**
 * Knockout cut: given a field ranked best-first, the top half (ceil(n/2)) advance
 * and the bottom half are eliminated — 16 → 8 → 4 → 2 → 1. A 2-player final cuts
 * one, leaving the champion.
 */
export function splitKnockoutField(rankedIds: string[]): { advancing: string[]; eliminated: string[] } {
  const advanceCount = Math.ceil(rankedIds.length / 2)
  return { advancing: rankedIds.slice(0, advanceCount), eliminated: rankedIds.slice(advanceCount) }
}

/**
 * Round label for a *group* bracket, named by how many rooms the entrants form:
 * one room is the Final, two rooms the Semifinals, otherwise "Round of N". (Chess
 * keeps the power-of-two `roundLabel`; this suits Whot/Scrabble's 16 → 4 → 1.)
 */
export function groupRoundLabel(entrants: number, groupSize: number): string {
  if (entrants <= 1) return 'Champion'
  const rooms = Math.ceil(entrants / Math.max(2, groupSize))
  if (rooms === 1) return 'Final'
  if (rooms === 2) return 'Semifinals'
  return `Round of ${entrants}`
}

/** Human label for a round given how many players enter it. */
export function roundLabel(entrants: number): string {
  if (entrants <= 1) return 'Champion'
  if (entrants <= 2) return 'Final'
  if (entrants <= 4) return 'Semifinal'
  if (entrants <= 8) return 'Quarterfinal'
  return `Round of ${nextPowerOfTwo(entrants)}`
}
