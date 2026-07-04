import {
  HONORS,
  THIRTEEN_ORPHANS,
  TILE_ORDER,
  countsFor,
  isFlowerTile,
  isHonor,
  isSuited,
  mahjongTileBase,
  makeSuitTile,
  removeMany,
  sortMahjongTiles,
  tileNumber,
  tileSuit,
} from '@/lib/mahjong-core'
import type { MahjongMeld, MahjongPlayerState, MahjongRuleset, MahjongWinningPattern } from '@/types'

export type MahjongConcealedGroup = {
  type: 'chow' | 'pung'
  tiles: string[]
}

export type MahjongWinAnalysis = {
  valid: boolean
  pattern?: MahjongWinningPattern
  pair?: string[]
  concealedGroups?: MahjongConcealedGroup[]
}

function findGroupDecomposition(tiles: string[]): MahjongConcealedGroup[] | null {
  if (tiles.length === 0) return []
  const sorted = sortMahjongTiles(tiles)
  const first = sorted[0]
  if (!first) return []

  const counts = countsFor(sorted)
  if ((counts.get(first) ?? 0) >= 3) {
    const rest = removeMany(sorted, [first, first, first])
    const groups = rest ? findGroupDecomposition(rest) : null
    if (groups) return [{ type: 'pung', tiles: [first, first, first] }, ...groups]
  }

  if (isSuited(first)) {
    const suit = tileSuit(first)
    const n = tileNumber(first)
    if (n <= 7) {
      const second = makeSuitTile(suit, n + 1)
      const third = makeSuitTile(suit, n + 2)
      if ((counts.get(second) ?? 0) > 0 && (counts.get(third) ?? 0) > 0) {
        const rest = removeMany(sorted, [first, second, third])
        const groups = rest ? findGroupDecomposition(rest) : null
        if (groups) return [{ type: 'chow', tiles: [first, second, third] }, ...groups]
      }
    }
  }

  return null
}

function findStandardDecomposition(tiles: string[], neededGroups: number): MahjongWinAnalysis | null {
  const sorted = sortMahjongTiles(tiles)
  if (sorted.length !== neededGroups * 3 + 2) return null

  const counts = countsFor(sorted)
  for (const [tile, count] of counts.entries()) {
    if (count < 2) continue
    const rest = removeMany(sorted, [tile, tile])
    const concealedGroups = rest ? findGroupDecomposition(rest) : null
    if (concealedGroups && concealedGroups.length === neededGroups) {
      return { valid: true, pattern: 'standard', pair: [tile, tile], concealedGroups }
    }
  }
  return null
}

function canSevenPairs(tiles: string[]): boolean {
  if (tiles.length !== 14) return false
  const counts = [...countsFor(tiles).values()]
  return counts.length === 7 && counts.every((count) => count === 2)
}

function canThirteenOrphans(tiles: string[]): boolean {
  if (tiles.length !== 14) return false
  const counts = countsFor(tiles)
  const hasEveryOrphan = THIRTEEN_ORPHANS.every((tile) => (counts.get(tile) ?? 0) >= 1)
  const hasOnlyOrphans = tiles.every((tile) => THIRTEEN_ORPHANS.includes(tile as (typeof THIRTEEN_ORPHANS)[number]))
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

function analyzeMcrSpecialWin(hand: string[], melds: MahjongMeld[]): MahjongWinAnalysis | null {
  if (melds.length > 0 || hand.length !== 14) return null
  const sorted = sortMahjongTiles(hand.map(mahjongTileBase))
  const counts = countsFor(sorted)
  const unique = [...counts.values()].every((count) => count === 1)

  for (const knitted of knittedSets()) {
    if (unique && sorted.every((tile) => isHonor(tile) || knitted.includes(tile))) {
      const honorCount = sorted.filter(isHonor).length
      const knittedCount = sorted.filter((tile) => knitted.includes(tile)).length
      const hasAllHonors = HONORS.every((tile) => (counts.get(tile) ?? 0) > 0)
      if (honorCount >= 5 && knittedCount >= 7) {
        return { valid: true, pattern: hasAllHonors ? 'greater_honors_knitted' : 'lesser_honors_knitted' }
      }
    }

    const hasKnitted = knitted.every((tile) => (counts.get(tile) ?? 0) > 0)
    if (!hasKnitted) continue
    const rest = removeMany(sorted, knitted)
    if (!rest) continue
    const standardRest = findStandardDecomposition(rest, 1)
    if (standardRest) return { ...standardRest, pattern: 'knitted_straight' }
  }

  return null
}

export function analyzeMahjongWin(hand: string[], melds: MahjongMeld[]): MahjongWinAnalysis {
  const neededGroups = Math.max(0, 4 - melds.length)
  const sorted = sortMahjongTiles(hand)

  if (neededGroups === 4 && canThirteenOrphans(sorted)) {
    return { valid: true, pattern: 'thirteen_orphans' }
  }

  if (neededGroups === 4 && canSevenPairs(sorted)) {
    return { valid: true, pattern: 'seven_pairs' }
  }

  const standard = findStandardDecomposition(sorted, neededGroups)
  if (standard) return standard

  return { valid: false }
}

export function analyzeMahjongWinForRuleset(
  hand: string[],
  melds: MahjongMeld[],
  ruleset: MahjongRuleset
): MahjongWinAnalysis {
  if (ruleset === 'mcr') {
    const special = analyzeMcrSpecialWin(hand, melds)
    if (special) return special
  }
  return analyzeMahjongWin(hand, melds)
}

export function canDeclareMahjong(hand: string[], melds: MahjongMeld[]): boolean {
  return analyzeMahjongWin(hand, melds).valid
}

export function canDeclareMahjongForRuleset(hand: string[], melds: MahjongMeld[], ruleset: MahjongRuleset): boolean {
  return analyzeMahjongWinForRuleset(hand, melds, ruleset).valid
}

export function repeatedTile(tiles: string[]): string | null {
  const first = tiles[0]
  if (!first) return null
  return tiles.every((tile) => tile === first) ? first : null
}

export function allVisibleTiles(hand: string[], melds: MahjongMeld[]): string[] {
  return [...hand, ...melds.flatMap((meld) => meld.tiles)]
}

export function hasOpenMeld(melds: MahjongMeld[]): boolean {
  return melds.some((meld) => !!meld.from_player_id && !meld.concealed)
}

export function isClosedHand(melds: MahjongMeld[]): boolean {
  return !hasOpenMeld(melds)
}

export function winningTilesForHand(hand: string[], melds: MahjongMeld[]): string[] {
  const candidates = TILE_ORDER.filter((tile) => !isFlowerTile(tile))
  return candidates.filter((tile) => canDeclareMahjong([...hand, tile], melds))
}

export function isTenpai(hand: string[], melds: MahjongMeld[]): boolean {
  return winningTilesForHand(hand, melds).length > 0
}

export function hasDiscardedWinningTile(state: MahjongPlayerState): boolean {
  const waits = new Set(winningTilesForHand(state.hand, state.melds).map(mahjongTileBase))
  return state.discarded.some((tile) => waits.has(mahjongTileBase(tile)))
}
