// Shared Scrabble constants — imported by both the rules engine (src/lib/scrabble.ts)
// and the UI (src/components/scrabble/*). Standard English-language Scrabble ruleset.

export const SCRABBLE_BOARD_SIZE = 15
export const SCRABBLE_RACK_SIZE = 7
/** Bonus for using all 7 rack tiles in one play ("bingo"). */
export const SCRABBLE_BINGO_BONUS = 50
/** Center square (0-indexed) the first word must cover. */
export const SCRABBLE_CENTER = { row: 7, col: 7 } as const

/** Point value per letter. '?' (blank) is always 0. */
export const SCRABBLE_TILE_VALUES: Record<string, number> = {
  A: 1,
  B: 3,
  C: 3,
  D: 2,
  E: 1,
  F: 4,
  G: 2,
  H: 4,
  I: 1,
  J: 8,
  K: 5,
  L: 1,
  M: 3,
  N: 1,
  O: 1,
  P: 3,
  Q: 10,
  R: 1,
  S: 1,
  T: 1,
  U: 1,
  V: 4,
  W: 4,
  X: 8,
  Y: 4,
  Z: 10,
  '?': 0,
}

/** Tile counts in a fresh 100-tile bag (2 blanks). */
export const SCRABBLE_TILE_DISTRIBUTION: Record<string, number> = {
  A: 9,
  B: 2,
  C: 2,
  D: 4,
  E: 12,
  F: 2,
  G: 3,
  H: 2,
  I: 9,
  J: 1,
  K: 1,
  L: 4,
  M: 2,
  N: 6,
  O: 8,
  P: 2,
  Q: 1,
  R: 6,
  S: 4,
  T: 6,
  U: 4,
  V: 2,
  W: 2,
  X: 1,
  Y: 2,
  Z: 1,
  '?': 2,
}

export type ScrabblePremium = '' | 'DL' | 'TL' | 'DW' | 'TW'

// Standard board premium squares (0-indexed). The grid is 8-fold symmetric, so we
// list one set of coordinates and mirror across both axes when building the layout.
const TW_COORDS: [number, number][] = [
  [0, 0],
  [0, 7],
  [7, 0],
]
const DW_COORDS: [number, number][] = [
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 4],
  [7, 7],
]
const TL_COORDS: [number, number][] = [
  [1, 5],
  [5, 1],
  [5, 5],
]
const DL_COORDS: [number, number][] = [
  [0, 3],
  [2, 6],
  [3, 0],
  [3, 7],
  [6, 2],
  [6, 6],
  [7, 3],
]

function buildPremiumLayout(): ScrabblePremium[][] {
  const n = SCRABBLE_BOARD_SIZE
  const grid: ScrabblePremium[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => '' as ScrabblePremium)
  )
  const mirror = (r: number, c: number): [number, number][] => {
    const rs = [r, n - 1 - r]
    const cs = [c, n - 1 - c]
    const out: [number, number][] = []
    for (const rr of rs) for (const cc of cs) out.push([rr, cc])
    return out
  }
  const apply = (coords: [number, number][], val: ScrabblePremium) => {
    for (const [r, c] of coords) for (const [rr, cc] of mirror(r, c)) grid[rr][cc] = val
  }
  // Order matters only where coords would overlap; standard layout has none.
  apply(TW_COORDS, 'TW')
  apply(DW_COORDS, 'DW')
  apply(TL_COORDS, 'TL')
  apply(DL_COORDS, 'DL')
  return grid
}

/** 15×15 premium-square layout, row-major. SCRABBLE_PREMIUM_LAYOUT[row][col]. */
export const SCRABBLE_PREMIUM_LAYOUT: ScrabblePremium[][] = buildPremiumLayout()

export function scrabblePremiumAt(row: number, col: number): ScrabblePremium {
  return SCRABBLE_PREMIUM_LAYOUT[row]?.[col] ?? ''
}
