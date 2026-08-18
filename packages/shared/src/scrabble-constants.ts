// Shared Word Tiles constants — imported by both the rules engine (src/lib/scrabble.ts)
// and the UI (src/components/scrabble/*). English-language ruleset with an original
// tile distribution and premium-square layout (see docs below).

export const SCRABBLE_BOARD_SIZE = 15
export const SCRABBLE_RACK_SIZE = 7
/** Bonus for using all 7 rack tiles in one play (the "bingo" / full-rack bonus). */
export const SCRABBLE_BINGO_BONUS = 50
/** Center square (0-indexed) the first word must cover. */
export const SCRABBLE_CENTER = { row: 7, col: 7 } as const

/**
 * Point value per letter. '?' (blank) is always 0.
 *
 * Original distribution — English-frequency-based so play is balanced, but the point
 * values and counts intentionally differ from any specific commercial word game's
 * economy. Rare consonants stay expensive (J/X at 8, Q/Z at 10) because that's how
 * English probability works, not because it's a copy of one.
 */
export const SCRABBLE_TILE_VALUES: Record<string, number> = {
  A: 1,
  B: 3,
  C: 3,
  D: 2,
  E: 1,
  F: 4,
  G: 2,
  H: 3,
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

/** Tile counts in a fresh 100-tile bag (98 letters + 2 blanks). */
export const SCRABBLE_TILE_DISTRIBUTION: Record<string, number> = {
  A: 9,
  B: 2,
  C: 2,
  D: 4,
  E: 11,
  F: 2,
  G: 3,
  H: 3,
  I: 8,
  J: 1,
  K: 1,
  L: 4,
  M: 2,
  N: 6,
  O: 8,
  P: 2,
  Q: 1,
  R: 6,
  S: 5,
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

/*
 * Original 15×15 premium-square layout.
 *
 * Base coordinates below live in the top-left quadrant (r ≤ 7, c ≤ 7). buildPremiumLayout
 * mirrors each across both axes, producing a layout that is 4-fold rotationally symmetric
 * and mirror-symmetric on both axes — i.e. fair from every seat and identical after a 90°
 * turn of the physical board. Any base coord on an axis (r = 7 or c = 7) mirrors to 2
 * squares; off-axis coords mirror to 4. Coord pairs of the form (r, c) plus (c, r) are
 * included together so 90° rotational symmetry is preserved.
 *
 * Design differs from the well-known commercial layout on purpose:
 *   • Triple-word squares are inset OFF the corners, not on them.
 *   • True corners get Double-word instead — an intentional inversion of the standard
 *     "corner triple-word" fingerprint.
 *   • The centre is a neutral start star (no premium); the first word scores at face
 *     value. Play is otherwise unchanged: first word must still cross the centre.
 *   • Premium counts total 8 TW / 16 DW / 12 TL / 24 DL — 60 premium squares plus
 *     the neutral centre — balanced and playtestable.
 */

/** 8 total: (2,2) [×4 inset corners] + (7,4) [×2] + (4,7) [×2]. */
const TW_COORDS: [number, number][] = [
  [2, 2],
  [7, 4],
  [4, 7],
]
/** 16 total: (0,0) [×4 true corners] + (1,1) [×4] + (4,4) [×4] + (5,5) [×4]. */
const DW_COORDS: [number, number][] = [
  [0, 0],
  [1, 1],
  [4, 4],
  [5, 5],
]
/** 12 total: (1,5) [×4] + (5,1) [×4] + (6,6) [×4 inner cluster]. */
const TL_COORDS: [number, number][] = [
  [1, 5],
  [5, 1],
  [6, 6],
]
/** 24 total: 8 outer-edge slots + 8 inner-ring slots + 8 axis pairs. */
const DL_COORDS: [number, number][] = [
  [0, 3],
  [3, 0],
  [0, 7],
  [7, 0],
  [2, 6],
  [6, 2],
  [3, 7],
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
