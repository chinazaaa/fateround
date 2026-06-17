import {
  groupHasMortgage,
  ownsColorMonopoly,
  spaceAt,
  MONOPOLY_HOUSES_UNDER_HOTEL,
  MONOPOLY_HOTEL_LEVEL,
  MONOPOLY_MAX_HOUSES_PER_PROPERTY,
  type BuildingLevel,
  type MonopolySpace,
} from '@/lib/monopoly-board'

export function parseJsonRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  return raw as Record<string, string>
}

export function parseBuildings(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  return raw as Record<string, number>
}

export function parseMortgaged(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return {}
  return raw as Record<string, boolean>
}

export function buildingLevel(buildings: Record<string, number>, spaceIndex: number): BuildingLevel {
  const level = buildings[String(spaceIndex)] ?? 0
  return Math.min(5, Math.max(0, level)) as BuildingLevel
}

export function stationRent(owners: Record<string, string>, ownerId: string, baseRent: number): number {
  const count = owners
    ? Object.entries(owners).filter(([idx, id]) => {
        const space = spaceAt(Number(idx))
        return id === ownerId && space.type === 'station'
      }).length
    : 0
  return baseRent * 2 ** Math.max(0, count - 1)
}

export function utilityRent(
  owners: Record<string, string>,
  ownerId: string,
  diceTotal: number
): number {
  const count = Object.entries(owners).filter(([idx, id]) => {
    const space = spaceAt(Number(idx))
    return id === ownerId && space.type === 'utility'
  }).length
  return diceTotal * (count >= 2 ? 10 : 4)
}

export function computeRent(
  space: MonopolySpace,
  owners: Record<string, string>,
  ownerId: string,
  diceTotal: number,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>
): number {
  if (mortgaged[String(space.index)]) return 0

  if (space.type === 'station') return stationRent(owners, ownerId, space.rent ?? 25)
  if (space.type === 'utility') return utilityRent(owners, ownerId, diceTotal)

  if (space.type === 'property' && space.rentTable) {
    const level = buildingLevel(buildings, space.index)
    if (level > 0) return space.rentTable[level] ?? space.rent ?? 0
    const base = space.rent ?? space.rentTable[0] ?? 0
    if (
      space.color &&
      ownsColorMonopoly(owners, ownerId, space.color) &&
      !groupHasMortgage(space.color, ownerId, owners, mortgaged)
    ) {
      return base * 2
    }
    return base
  }

  return space.rent ?? 0
}

export function totalHousesOwned(
  buildings: Record<string, number>,
  ownerId: string,
  owners: Record<string, string>
): number {
  let total = 0
  for (const [idx, level] of Object.entries(buildings)) {
    if (owners[idx] !== ownerId) continue
    if (level === MONOPOLY_HOTEL_LEVEL) total += MONOPOLY_HOUSES_UNDER_HOTEL
    else total += Math.min(level, MONOPOLY_MAX_HOUSES_PER_PROPERTY)
  }
  return total
}

export function totalHotelsOwned(
  buildings: Record<string, number>,
  ownerId: string,
  owners: Record<string, string>
): number {
  return Object.entries(buildings).filter(
    ([idx, level]) => owners[idx] === ownerId && level === MONOPOLY_HOTEL_LEVEL
  ).length
}
