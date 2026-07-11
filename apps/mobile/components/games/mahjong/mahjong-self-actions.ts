import { mahjongTileBase, mahjongTileShortLabel, sortMahjongTiles } from '@fateround/shared/mahjong'
import type { MahjongMeld, MahjongPlayerState, MahjongRuleset } from '@fateround/shared'

/**
 * On-your-turn self actions for Mahjong, ported from the web reference:
 *   - self-draw win (tsumo) detection: `canDeclareMahjongForRuleset`
 *     (src/lib/mahjong-hand.ts)
 *   - concealed / added kong options: `mahjongSelfKongOptions`
 *     (src/lib/mahjong-claims.ts)
 *
 * The server (`processMahjongClaim`) re-validates every declaration; these
 * helpers only decide which buttons to surface on the player's own turn.
 */

const HONORS = ['we', 'ws', 'ww', 'wn', 'dr', 'dg', 'dw'] as const
const THIRTEEN_ORPHANS = ['m1', 'm9', 'p1', 'p9', 's1', 's9', ...HONORS] as const

function isSuitedBase(base: string): boolean {
  return /^[mps][1-9]$/.test(base)
}

function isHonorBase(base: string): boolean {
  return HONORS.includes(base as (typeof HONORS)[number])
}

function tileSuit(base: string): string {
  return base[0] ?? ''
}

function tileNumber(base: string): number {
  return Number(base.slice(1))
}

function makeSuitTile(suit: string, n: number): string {
  return `${suit}${n}`
}

function countsFor(tiles: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tile of tiles) {
    const base = mahjongTileBase(tile)
    counts.set(base, (counts.get(base) ?? 0) + 1)
  }
  return counts
}

function removeOne(tiles: string[], tile: string): string[] | null {
  let index = tiles.indexOf(tile)
  if (index === -1) index = tiles.findIndex((item) => mahjongTileBase(item) === mahjongTileBase(tile))
  if (index === -1) return null
  return [...tiles.slice(0, index), ...tiles.slice(index + 1)]
}

function removeMany(tiles: string[], remove: string[]): string[] | null {
  let next = [...tiles]
  for (const tile of remove) {
    const removed = removeOne(next, tile)
    if (!removed) return null
    next = removed
  }
  return next
}

function repeatedTile(tiles: string[]): string | null {
  const first = tiles[0] ? mahjongTileBase(tiles[0]) : null
  if (!first) return null
  return tiles.every((tile) => mahjongTileBase(tile) === first) ? first : null
}

type ConcealedGroup = { type: 'chow' | 'pung'; tiles: string[] }

function findGroupDecomposition(tiles: string[]): ConcealedGroup[] | null {
  if (tiles.length === 0) return []
  const sorted = sortMahjongTiles(tiles)
  const first = sorted[0]
  if (!first) return []
  const firstBase = mahjongTileBase(first)

  const counts = countsFor(sorted)
  if ((counts.get(firstBase) ?? 0) >= 3) {
    const rest = removeMany(sorted, [firstBase, firstBase, firstBase])
    const groups = rest ? findGroupDecomposition(rest) : null
    if (groups) return [{ type: 'pung', tiles: [firstBase, firstBase, firstBase] }, ...groups]
  }

  if (isSuitedBase(firstBase)) {
    const suit = tileSuit(firstBase)
    const n = tileNumber(firstBase)
    if (n <= 7) {
      const second = makeSuitTile(suit, n + 1)
      const third = makeSuitTile(suit, n + 2)
      if ((counts.get(second) ?? 0) > 0 && (counts.get(third) ?? 0) > 0) {
        const rest = removeMany(sorted, [firstBase, second, third])
        const groups = rest ? findGroupDecomposition(rest) : null
        if (groups) return [{ type: 'chow', tiles: [firstBase, second, third] }, ...groups]
      }
    }
  }

  return null
}

function hasStandardDecomposition(tiles: string[], neededGroups: number): boolean {
  const sorted = sortMahjongTiles(tiles)
  if (sorted.length !== neededGroups * 3 + 2) return false

  const counts = countsFor(sorted)
  for (const [tile, count] of counts.entries()) {
    if (count < 2) continue
    const rest = removeMany(sorted, [tile, tile])
    const concealedGroups = rest ? findGroupDecomposition(rest) : null
    if (concealedGroups && concealedGroups.length === neededGroups) return true
  }
  return false
}

function canSevenPairs(tiles: string[]): boolean {
  if (tiles.length !== 14) return false
  const values = [...countsFor(tiles).values()]
  return values.length === 7 && values.every((count) => count === 2)
}

function canThirteenOrphans(tiles: string[]): boolean {
  if (tiles.length !== 14) return false
  const counts = countsFor(tiles)
  const bases = tiles.map(mahjongTileBase)
  const hasEveryOrphan = THIRTEEN_ORPHANS.every((tile) => (counts.get(tile) ?? 0) >= 1)
  const hasOnlyOrphans = bases.every((tile) => THIRTEEN_ORPHANS.includes(tile as (typeof THIRTEEN_ORPHANS)[number]))
  const hasPair = THIRTEEN_ORPHANS.some((tile) => (counts.get(tile) ?? 0) >= 2)
  return hasEveryOrphan && hasOnlyOrphans && hasPair
}

function knittedSets(): string[][] {
  const patterns = [
    [1, 4, 7],
    [2, 5, 8],
    [3, 6, 9],
  ]
  const permutations = [
    ['m', 'p', 's'],
    ['m', 's', 'p'],
    ['p', 'm', 's'],
    ['p', 's', 'm'],
    ['s', 'm', 'p'],
    ['s', 'p', 'm'],
  ]
  return permutations.map((suits) => patterns.flatMap((numbers, index) => numbers.map((n) => `${suits[index]}${n}`)))
}

function canMcrSpecialWin(hand: string[], melds: MahjongMeld[]): boolean {
  if (melds.length > 0 || hand.length !== 14) return false
  const sorted = sortMahjongTiles(hand.map(mahjongTileBase))
  const counts = countsFor(sorted)
  const unique = [...counts.values()].every((count) => count === 1)

  for (const knitted of knittedSets()) {
    if (unique && sorted.every((tile) => isHonorBase(tile) || knitted.includes(tile))) {
      const honorCount = sorted.filter(isHonorBase).length
      const knittedCount = sorted.filter((tile) => knitted.includes(tile)).length
      if (honorCount >= 5 && knittedCount >= 7) return true
    }

    const hasKnitted = knitted.every((tile) => (counts.get(tile) ?? 0) > 0)
    if (!hasKnitted) continue
    const rest = removeMany(sorted, knitted)
    if (!rest) continue
    if (hasStandardDecomposition(rest, 1)) return true
  }

  return false
}

function canDeclareMahjong(hand: string[], melds: MahjongMeld[]): boolean {
  const neededGroups = Math.max(0, 4 - melds.length)
  const sorted = sortMahjongTiles(hand)
  if (neededGroups === 4 && canThirteenOrphans(sorted)) return true
  if (neededGroups === 4 && canSevenPairs(sorted)) return true
  return hasStandardDecomposition(sorted, neededGroups)
}

/** Whether the drawn hand is a complete (self-draw) win under the ruleset. */
export function canDeclareMahjongForRuleset(
  hand: string[],
  melds: MahjongMeld[],
  ruleset: MahjongRuleset
): boolean {
  if (ruleset === 'mcr' && canMcrSpecialWin(hand, melds)) return true
  return canDeclareMahjong(hand, melds)
}

/** Every non-flower tile base a hand can wait on (suits 1-9 + honors). */
const MAHJONG_WAIT_BASES: string[] = [
  ...(['m', 'p', 's'] as const).flatMap((suit) => Array.from({ length: 9 }, (_, i) => `${suit}${i + 1}`)),
  ...HONORS,
]

/**
 * Whether the concealed hand is one tile away from a win (tenpai). Mirrors the
 * web `isTenpai` (src/lib/mahjong-hand.ts): a hand is tenpai when some drawable
 * tile completes it. Ruleset-agnostic, matching the web helper.
 */
export function isMahjongTenpai(hand: string[], melds: MahjongMeld[]): boolean {
  return MAHJONG_WAIT_BASES.some((tile) => canDeclareMahjong([...hand, tile], melds))
}

/**
 * Whether claiming the given discard would complete the hand (ron). Ruleset-aware,
 * mirroring the web `mahjongClaimOptionsForPlayer` win check. The server
 * re-validates; this only decides whether to surface the Mahjong claim button.
 */
export function canRonWithDiscard(
  hand: string[],
  melds: MahjongMeld[],
  discardTile: string,
  ruleset: MahjongRuleset
): boolean {
  return canDeclareMahjongForRuleset([...hand, discardTile], melds, ruleset)
}

export type MahjongSelfKongOption = {
  /** Base tile to declare the kong on (sent to the claim endpoint). */
  tile: string
  source: 'concealed' | 'added'
  label: string
}

/**
 * Concealed kong (four in hand) and added kong (fourth tile onto an existing
 * pung) options for the player on their own turn.
 */
export function mahjongSelfKongOptions(state: MahjongPlayerState | null | undefined): MahjongSelfKongOption[] {
  if (!state) return []
  const counts = countsFor(state.hand)
  const options: MahjongSelfKongOption[] = []

  for (const [tile, count] of counts.entries()) {
    if (count >= 4) {
      options.push({ tile, source: 'concealed', label: `Kong ${mahjongTileShortLabel(tile)}` })
    }
  }

  for (const meld of state.melds) {
    if (meld.type !== 'pung') continue
    const tile = repeatedTile(meld.tiles)
    if (tile && (counts.get(tile) ?? 0) >= 1) {
      options.push({ tile, source: 'added', label: `Add kong ${mahjongTileShortLabel(tile)}` })
    }
  }

  return options
}
