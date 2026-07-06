import { parseMahjongRuleset } from '@/lib/mahjong-rulesets'
import { countsFor, isSuited, makeSuitTile, sortMahjongTiles, tileNumber, tileSuit } from '@/lib/mahjong-core'
import { canDeclareMahjongForRuleset, repeatedTile } from '@/lib/mahjong-hand'
import { nextTurnIndexAfter, stateFor, turnDistanceAfterDiscard } from '@/lib/mahjong-session'
import type { MahjongClaimType, MahjongPlayerState, MahjongSession } from '@/types'

export type MahjongClaimOption = {
  type: MahjongClaimType
  tiles?: string[]
  source?: 'discard' | 'concealed' | 'added'
}

export function possibleChowCombos(hand: string[], discardTile: string): string[][] {
  if (!isSuited(discardTile)) return []
  const suit = tileSuit(discardTile)
  const n = tileNumber(discardTile)
  const candidates = [
    [n - 2, n - 1],
    [n - 1, n + 1],
    [n + 1, n + 2],
  ].filter(([a, b]) => a >= 1 && b <= 9)

  const counts = countsFor(hand)
  return candidates
    .map(([a, b]) => [makeSuitTile(suit, a), makeSuitTile(suit, b)])
    .filter(([a, b]) => (counts.get(a) ?? 0) > 0 && (counts.get(b) ?? 0) > 0)
}

export function mahjongSelfKongOptions(state: MahjongPlayerState | null | undefined): MahjongClaimOption[] {
  if (!state) return []
  const counts = countsFor(state.hand)
  const options: MahjongClaimOption[] = []

  for (const [tile, count] of counts.entries()) {
    if (count >= 4) options.push({ type: 'kong', tiles: [tile, tile, tile, tile], source: 'concealed' })
  }

  for (const meld of state.melds) {
    if (meld.type !== 'pung') continue
    const tile = repeatedTile(meld.tiles)
    if (tile && (counts.get(tile) ?? 0) >= 1) {
      options.push({ type: 'kong', tiles: [tile], source: 'added' })
    }
  }

  return options
}

function claimPriority(type: MahjongClaimType): number {
  if (type === 'mahjong') return 0
  if (type === 'kong' || type === 'pung') return 1
  return 2
}

export function mahjongClaimOptionsForPlayer(
  session: MahjongSession,
  states: MahjongPlayerState[],
  playerId: string
): MahjongClaimOption[] {
  if (session.phase !== 'claim' || !session.last_discard) return []
  const state = stateFor(states, playerId)
  if (!state || session.last_discard.player_id === playerId) return []

  const tile = session.last_discard.tile
  const counts = countsFor(state.hand)
  const ruleset = parseMahjongRuleset(session.ruleset)
  const options: MahjongClaimOption[] = []
  if (canDeclareMahjongForRuleset([...state.hand, tile], state.melds, ruleset)) options.push({ type: 'mahjong' })
  if ((counts.get(tile) ?? 0) >= 3) options.push({ type: 'kong', tiles: [tile, tile, tile] })
  if ((counts.get(tile) ?? 0) >= 2) options.push({ type: 'pung', tiles: [tile, tile] })

  const nextIndex = nextTurnIndexAfter(session, session.last_discard.player_id)
  const isNextPlayer = session.turn_order[nextIndex] === playerId
  if (isNextPlayer) {
    for (const chow of possibleChowCombos(state.hand, tile)) {
      options.push({ type: 'chow', tiles: chow })
    }
  }

  return options
}

export function eligibleClaimPlayerIds(session: MahjongSession, states: MahjongPlayerState[]): string[] {
  return session.turn_order.filter((playerId) => mahjongClaimOptionsForPlayer(session, states, playerId).length > 0)
}

function highestPriorityClaim(
  session: MahjongSession,
  states: MahjongPlayerState[]
): { playerId: string; priority: number; distance: number } | null {
  const passed = new Set(session.claim_passes ?? [])
  const ranked = session.turn_order
    .filter((playerId) => !passed.has(playerId))
    .flatMap((playerId) =>
      mahjongClaimOptionsForPlayer(session, states, playerId).map((option) => ({
        playerId,
        priority: claimPriority(option.type),
        distance: turnDistanceAfterDiscard(session, playerId),
      }))
    )
    .sort((a, b) => a.priority - b.priority || a.distance - b.distance)

  return ranked[0] ?? null
}

export function canResolveClaimNow(
  session: MahjongSession,
  states: MahjongPlayerState[],
  playerId: string,
  claimType: MahjongClaimType
): boolean {
  const top = highestPriorityClaim(session, states)
  if (!top) return true
  const ownPriority = claimPriority(claimType)
  const ownDistance = turnDistanceAfterDiscard(session, playerId)
  if (claimType === 'mahjong' && top.priority === 0) return ownPriority === 0
  return top.playerId === playerId && top.priority === ownPriority && top.distance === ownDistance
}

export function claimTilesFor(
  claimType: MahjongClaimType,
  hand: string[],
  discardTile: string,
  requestedTiles?: string[]
): { tiles: string[]; meldTiles: string[]; error?: string } {
  if (claimType === 'pung')
    return { tiles: [discardTile, discardTile], meldTiles: [discardTile, discardTile, discardTile] }
  if (claimType === 'kong') {
    return {
      tiles: [discardTile, discardTile, discardTile],
      meldTiles: [discardTile, discardTile, discardTile, discardTile],
    }
  }
  if (claimType === 'chow') {
    const combos = possibleChowCombos(hand, discardTile)
    const selected =
      requestedTiles && requestedTiles.length === 2
        ? combos.find((combo) => combo[0] === requestedTiles[0] && combo[1] === requestedTiles[1])
        : combos[0]
    if (!selected) return { tiles: [], meldTiles: [], error: 'No legal Chow available' }
    return { tiles: selected, meldTiles: sortMahjongTiles([...selected, discardTile]) }
  }
  return { tiles: [], meldTiles: [] }
}

export function addedKongIndex(state: MahjongPlayerState, tile: string): number {
  return state.melds.findIndex((meld) => meld.type === 'pung' && repeatedTile(meld.tiles) === tile)
}
