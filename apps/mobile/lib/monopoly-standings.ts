import type { MonopolyPlayerState } from '@fateround/shared'
import {
  MONOPOLY_HOTEL_LEVEL,
  MONOPOLY_HOUSES_UNDER_HOTEL,
  MONOPOLY_MAX_HOUSES_PER_PROPERTY,
  mortgageValue,
  spaceAt,
  type MonopolySpace,
} from '@fateround/shared/monopoly-board'

/**
 * Monopoly net-worth standings — ported from the web `src/lib/monopoly.ts`
 * (`buildMonopolyStandings` / `computeMonopolyNetWorth`) since that logic isn't
 * in the shared package. Net worth = cash + unmortgaged property prices +
 * building value + (mortgage value for mortgaged properties).
 */

export type MonopolyStanding = {
  playerId: string
  name: string
  rank: number
  netWorth: number
  cash: number
  propertyCount: number
}

function parseRecord<T>(raw: unknown): Record<string, T> {
  if (!raw || typeof raw !== 'object') return {}
  return raw as Record<string, T>
}

function buildingLevel(buildings: Record<string, number>, spaceIndex: number): number {
  return Math.min(5, Math.max(0, buildings[String(spaceIndex)] ?? 0))
}

function buildingAssetValue(space: MonopolySpace, level: number): number {
  if (level === 0) return 0
  const half = Math.floor((space.houseCost ?? 0) / 2)
  if (level === MONOPOLY_HOTEL_LEVEL) return half * MONOPOLY_HOUSES_UNDER_HOTEL
  return Math.min(level, MONOPOLY_MAX_HOUSES_PER_PROPERTY) * half
}

function computeNetWorth(
  state: MonopolyPlayerState,
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>
): number {
  if (state.bankrupt) return 0
  let total = state.cash
  for (const [idx, ownerId] of Object.entries(owners)) {
    if (ownerId !== state.player_id) continue
    const space = spaceAt(Number(idx))
    if (space.type !== 'property' && space.type !== 'station' && space.type !== 'utility') continue
    if (mortgaged[idx]) {
      total += mortgageValue(space)
    } else {
      total += space.price ?? 0
      total += buildingAssetValue(space, buildingLevel(buildings, Number(idx)))
    }
  }
  return total
}

export function buildMonopolyStandings(
  states: MonopolyPlayerState[],
  players: { id: string; name: string }[],
  propertyOwners: unknown,
  propertyBuildings: unknown,
  mortgagedProperties: unknown
): MonopolyStanding[] {
  const owners = parseRecord<string>(propertyOwners)
  const buildings = parseRecord<number>(propertyBuildings)
  const mortgaged = parseRecord<boolean>(mortgagedProperties)

  return states
    .map((state) => ({
      playerId: state.player_id,
      cash: state.cash ?? 0,
      netWorth: computeNetWorth(state, owners, buildings, mortgaged),
      propertyCount: Object.values(owners).filter((o) => o === state.player_id).length,
    }))
    .sort((a, b) => b.netWorth - a.netWorth)
    .map((row, index) => ({
      ...row,
      name: players.find((p) => p.id === row.playerId)?.name ?? 'Player',
      rank: index + 1,
    }))
}
