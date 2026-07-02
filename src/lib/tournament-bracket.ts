// Head-to-head bracket helpers: seeding into matches, byes, and round labels.
// Pure functions so the pairing/bye math can be unit-tested independently of the
// round-spawn endpoint (which handles shuffling + I/O).

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

/**
 * Knockout cut: given a field ranked best-first, the top half (ceil(n/2)) advance
 * and the bottom half are eliminated — 16 → 8 → 4 → 2 → 1. A 2-player final cuts
 * one, leaving the champion.
 */
export function splitKnockoutField(rankedIds: string[]): { advancing: string[]; eliminated: string[] } {
  const advanceCount = Math.ceil(rankedIds.length / 2)
  return { advancing: rankedIds.slice(0, advanceCount), eliminated: rankedIds.slice(advanceCount) }
}

/** Human label for a round given how many players enter it. */
export function roundLabel(entrants: number): string {
  if (entrants <= 1) return 'Champion'
  if (entrants <= 2) return 'Final'
  if (entrants <= 4) return 'Semifinal'
  if (entrants <= 8) return 'Quarterfinal'
  return `Round of ${nextPowerOfTwo(entrants)}`
}
