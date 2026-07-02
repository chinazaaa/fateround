// Head-to-head bracket helpers: seeding into matches, first-round byes, and
// round labels. Pure functions so the pairing/bye math can be unit-tested
// independently of the round-spawn endpoint (which handles shuffling + I/O).

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
 * round. When the count isn't a power of two, the top seeds receive byes.
 *
 * Byes are placed in this (the first uneven) round on purpose: handing out
 * `nextPowerOfTwo(n) - n` byes leaves exactly a power of two players standing
 * afterwards (bye players + match winners), so every later round pairs cleanly
 * with no further byes. For power-of-two inputs there are no byes.
 */
export function computeRoundPairings(seededIds: string[]): RoundPairing {
  const n = seededIds.length
  if (n <= 1) return { matches: [], byes: [...seededIds] }

  const byeCount = nextPowerOfTwo(n) - n
  const byes = seededIds.slice(0, byeCount)
  const playing = seededIds.slice(byeCount)

  const matches: [string, string][] = []
  for (let i = 0; i + 1 < playing.length; i += 2) {
    matches.push([playing[i], playing[i + 1]])
  }
  return { matches, byes }
}

/** Human label for a round given how many players enter it. */
export function roundLabel(entrants: number): string {
  if (entrants <= 1) return 'Champion'
  if (entrants <= 2) return 'Final'
  if (entrants <= 4) return 'Semifinal'
  if (entrants <= 8) return 'Quarterfinal'
  return `Round of ${nextPowerOfTwo(entrants)}`
}
