import {
  ownsColorMonopoly,
  spaceAt,
  spacesInGroup,
  type MonopolyColorGroup,
} from '@/lib/monopoly-board'
import { buildingLevel } from '@/lib/monopoly-rent'

export function canBuildOnGroup(
  group: MonopolyColorGroup,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>
): boolean {
  if (group === 'station' || group === 'utility') return false
  if (!ownsColorMonopoly(owners, ownerId, group)) return false
  return !spacesInGroup(group).some((s) => mortgaged[String(s.index)])
}

export function minBuildingsInGroup(
  group: MonopolyColorGroup,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>
): number {
  const sites = spacesInGroup(group).filter((s) => owners[String(s.index)] === ownerId)
  if (sites.length === 0) return 0
  return Math.min(...sites.map((s) => buildingLevel(buildings, s.index)))
}

export function maxBuildingsInGroup(
  group: MonopolyColorGroup,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>
): number {
  const sites = spacesInGroup(group).filter((s) => owners[String(s.index)] === ownerId)
  if (sites.length === 0) return 0
  return Math.max(...sites.map((s) => buildingLevel(buildings, s.index)))
}

/** True if a house may be built on this site (even-building rule). */
export function canAddHouse(
  spaceIndex: number,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>,
  housesInBank: number
): boolean {
  const space = spaceAt(spaceIndex)
  if (space.type !== 'property' || !space.color || !space.houseCost) return false
  if (owners[String(spaceIndex)] !== ownerId) return false
  if (!canBuildOnGroup(space.color, ownerId, owners, buildings, mortgaged)) return false
  const level = buildingLevel(buildings, spaceIndex)
  if (level >= 4) return false
  if (housesInBank < 1) return false
  const min = minBuildingsInGroup(space.color, ownerId, owners, buildings)
  return level <= min
}

/** True if a hotel may be built (4 houses on every site in group). */
export function canAddHotel(
  spaceIndex: number,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>,
  mortgaged: Record<string, boolean>,
  hotelsInBank: number
): boolean {
  const space = spaceAt(spaceIndex)
  if (space.type !== 'property' || !space.color) return false
  if (owners[String(spaceIndex)] !== ownerId) return false
  if (!canBuildOnGroup(space.color, ownerId, owners, buildings, mortgaged)) return false
  if (buildingLevel(buildings, spaceIndex) !== 4) return false
  if (hotelsInBank < 1) return false
  const groupSites = spacesInGroup(space.color).filter((s) => owners[String(s.index)] === ownerId)
  return groupSites.every((s) => buildingLevel(buildings, s.index) === 4)
}

export function canRemoveHouse(
  spaceIndex: number,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>
): boolean {
  const space = spaceAt(spaceIndex)
  if (space.type !== 'property' || !space.color) return false
  if (owners[String(spaceIndex)] !== ownerId) return false
  const level = buildingLevel(buildings, spaceIndex)
  if (level <= 0 || level === 5) return false
  const max = maxBuildingsInGroup(space.color, ownerId, owners, buildings)
  return level >= max
}

export function canRemoveHotel(
  spaceIndex: number,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>
): boolean {
  return owners[String(spaceIndex)] === ownerId && buildingLevel(buildings, spaceIndex) === 5
}

export function groupHasBuildings(
  group: MonopolyColorGroup,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>
): boolean {
  return spacesInGroup(group).some(
    (s) => owners[String(s.index)] === ownerId && buildingLevel(buildings, s.index) > 0
  )
}
