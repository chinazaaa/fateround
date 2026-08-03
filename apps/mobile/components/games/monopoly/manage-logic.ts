// Pure Monopoly build/mortgage/trade helpers ported from the web reference
// (src/lib/monopoly-build.ts, monopoly-rent.ts, monopoly-color-portfolio.ts,
// monopoly-trade-messages.ts). Kept local to the monopoly game directory so it
// can't collide with shared files edited by other agents.
import {
  MONOPOLY_BOARD,
  MONOPOLY_HOTEL_LEVEL,
  MONOPOLY_HOUSES_UNDER_HOTEL,
  MONOPOLY_MAX_HOUSES_PER_PROPERTY,
  countOwnedInGroup,
  groupHasMortgage,
  ownsColorMonopoly,
  spaceAt,
  spacesInGroup,
  type BuildingLevel,
  type MonopolyColorGroup,
  type MonopolySpace,
} from '@fateround/shared/monopoly-board'

// ---------------------------------------------------------------------------
// Pending trade shape (mirrors web MonopolyPendingTrade — board.pending_trade
// is typed `unknown` in shared types).
// ---------------------------------------------------------------------------
export interface MonopolyPendingTrade {
  from_player_id: string
  to_player_id: string
  offer_cash: number
  offer_properties: number[]
  offer_get_out_cards: number
  request_cash: number
  request_properties: number[]
  request_get_out_cards?: number
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------
export function parsePropertyOwners(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  return { ...(raw as Record<string, string>) }
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

export function playerProperties(owners: Record<string, string>, playerId: string): MonopolySpace[] {
  return MONOPOLY_BOARD.filter((s) => owners[String(s.index)] === playerId)
}

// ---------------------------------------------------------------------------
// Rent computation (for display)
// ---------------------------------------------------------------------------
function stationRent(owners: Record<string, string>, ownerId: string, baseRent: number): number {
  const count = owners
    ? Object.entries(owners).filter(([idx, id]) => {
        const space = spaceAt(Number(idx))
        return id === ownerId && space.type === 'station'
      }).length
    : 0
  return baseRent * 2 ** Math.max(0, count - 1)
}

function utilityRent(owners: Record<string, string>, ownerId: string, diceTotal: number): number {
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

// ---------------------------------------------------------------------------
// Build / sell eligibility (even-building rule)
// ---------------------------------------------------------------------------
function canBuildOnGroup(
  group: MonopolyColorGroup,
  ownerId: string,
  owners: Record<string, string>,
  mortgaged: Record<string, boolean>
): boolean {
  if (group === 'station' || group === 'utility') return false
  if (!ownsColorMonopoly(owners, ownerId, group)) return false
  return !spacesInGroup(group).some((s) => mortgaged[String(s.index)])
}

function minBuildingsInGroup(
  group: MonopolyColorGroup,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>
): number {
  const sites = spacesInGroup(group).filter((s) => owners[String(s.index)] === ownerId)
  if (sites.length === 0) return 0
  return Math.min(...sites.map((s) => buildingLevel(buildings, s.index)))
}

function maxBuildingsInGroup(
  group: MonopolyColorGroup,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>
): number {
  const sites = spacesInGroup(group).filter((s) => owners[String(s.index)] === ownerId)
  if (sites.length === 0) return 0
  return Math.max(...sites.map((s) => buildingLevel(buildings, s.index)))
}

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
  if (!canBuildOnGroup(space.color, ownerId, owners, mortgaged)) return false
  const level = buildingLevel(buildings, spaceIndex)
  if (level >= MONOPOLY_MAX_HOUSES_PER_PROPERTY) return false
  if (housesInBank < 1) return false
  const min = minBuildingsInGroup(space.color, ownerId, owners, buildings)
  return level <= min
}

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
  if (!canBuildOnGroup(space.color, ownerId, owners, mortgaged)) return false
  const siteLevel = buildingLevel(buildings, spaceIndex)
  if (siteLevel !== MONOPOLY_MAX_HOUSES_PER_PROPERTY) return false
  if (hotelsInBank < 1) return false
  const groupSites = spacesInGroup(space.color).filter((s) => owners[String(s.index)] === ownerId)
  return groupSites.every((s) => {
    const level = buildingLevel(buildings, s.index)
    return level === MONOPOLY_MAX_HOUSES_PER_PROPERTY || level === MONOPOLY_HOTEL_LEVEL
  })
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
  if (level <= 0 || level === MONOPOLY_HOTEL_LEVEL) return false
  const max = maxBuildingsInGroup(space.color, ownerId, owners, buildings)
  return level >= max
}

/** Mirrors web hotelRemovalBlocker — one predicate, so the UI gate can't drift. */
export function hotelRemovalBlocker(
  spaceIndex: number,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>,
  housesInBank: number
): 'not_owner' | 'no_hotel' | 'bank_short_on_houses' | null {
  if (owners[String(spaceIndex)] !== ownerId) return 'not_owner'
  if (buildingLevel(buildings, spaceIndex) !== MONOPOLY_HOTEL_LEVEL) return 'no_hotel'
  // Selling a hotel steps the site back down to 3 houses, so the bank must
  // actually have that many to give back. Without this check a player could
  // sell a hotel with the bank at 0 houses and drive houses_in_bank negative.
  if (housesInBank < MONOPOLY_HOUSES_UNDER_HOTEL) return 'bank_short_on_houses'
  return null
}

export function canRemoveHotel(
  spaceIndex: number,
  ownerId: string,
  owners: Record<string, string>,
  buildings: Record<string, number>,
  housesInBank: number
): boolean {
  return hotelRemovalBlocker(spaceIndex, ownerId, owners, buildings, housesInBank) === null
}

// Count how many build actions (houses + hotels) the player can currently make.
// Mirrors web src/components/monopoly/monopoly-manage-utils.ts so the mobile
// "you can build" nudge fires on exactly the same condition.
export function getMonopolyBuildActionCount(
  board: {
    property_owners?: unknown
    property_buildings?: unknown
    mortgaged_properties?: unknown
    houses_in_bank?: number
    hotels_in_bank?: number
  },
  myPlayerId: string
): number {
  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)
  const housesInBank = board.houses_in_bank ?? 32
  const hotelsInBank = board.hotels_in_bank ?? 12
  let count = 0

  for (const space of playerProperties(owners, myPlayerId)) {
    if (canAddHouse(space.index, myPlayerId, owners, buildings, mortgaged, housesInBank)) count += 1
    if (canAddHotel(space.index, myPlayerId, owners, buildings, mortgaged, hotelsInBank)) count += 1
  }

  return count
}

// ---------------------------------------------------------------------------
// Color portfolio
// ---------------------------------------------------------------------------
export const COLOR_SET_ORDER: MonopolyColorGroup[] = [
  'brown',
  'light_blue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'dark_blue',
  'station',
  'utility',
]

export const COLOR_GROUP_LABELS: Record<MonopolyColorGroup, string> = {
  brown: 'Brown',
  light_blue: 'Light blue',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  dark_blue: 'Dark blue',
  station: 'Stations',
  utility: 'Utilities',
}

export type ColorGroupStatus = {
  group: MonopolyColorGroup
  label: string
  owned: number
  total: number
  complete: boolean
}

export function buildColorGroupStatuses(
  owners: Record<string, string>,
  playerId: string
): Map<MonopolyColorGroup, ColorGroupStatus> {
  const map = new Map<MonopolyColorGroup, ColorGroupStatus>()
  for (const group of COLOR_SET_ORDER) {
    const spaces = spacesInGroup(group)
    const owned = countOwnedInGroup(owners, playerId, group)
    map.set(group, {
      group,
      label: COLOR_GROUP_LABELS[group],
      owned,
      total: spaces.length,
      complete: owned > 0 && ownsColorMonopoly(owners, playerId, group),
    })
  }
  return map
}

/** Property groups the player has a stake in, in board order. */
export function ownedColorGroups(owners: Record<string, string>, playerId: string): MonopolyColorGroup[] {
  return COLOR_SET_ORDER.filter((group) => countOwnedInGroup(owners, playerId, group) > 0)
}

export function propertiesInGroupForPlayer(
  owners: Record<string, string>,
  playerId: string,
  group: MonopolyColorGroup
): MonopolySpace[] {
  return spacesInGroup(group).filter((s) => owners[String(s.index)] === playerId)
}

// ---------------------------------------------------------------------------
// Trade messages
// ---------------------------------------------------------------------------
export type TradeSideItem =
  | { kind: 'cash'; amount: number }
  | { kind: 'property'; name: string; index: number }
  | { kind: 'jail_cards'; count: number }

export function normalizeTradePropertyList(raw: unknown): number[] {
  const values: unknown[] = []
  if (raw == null) return []
  if (Array.isArray(raw)) values.push(...raw)
  else if (typeof raw === 'number') values.push(raw)
  else if (typeof raw === 'string') values.push(...raw.split(/[,;\s]+/).filter(Boolean))
  else if (typeof raw === 'object') values.push(...Object.values(raw as Record<string, unknown>))

  const seen = new Set<number>()
  const normalized: number[] = []
  for (const value of values) {
    const index = Number(value)
    if (!Number.isInteger(index) || index < 0 || index > 39 || seen.has(index)) continue
    seen.add(index)
    normalized.push(index)
  }
  return normalized
}

export function normalizePendingTrade(raw: unknown): MonopolyPendingTrade | null {
  if (!raw || typeof raw !== 'object') return null
  const trade = raw as Record<string, unknown>
  if (typeof trade.from_player_id !== 'string' || typeof trade.to_player_id !== 'string') return null
  return {
    from_player_id: trade.from_player_id,
    to_player_id: trade.to_player_id,
    offer_cash: Number(trade.offer_cash) || 0,
    offer_properties: normalizeTradePropertyList(trade.offer_properties),
    offer_get_out_cards: Number(trade.offer_get_out_cards) || 0,
    request_cash: Number(trade.request_cash) || 0,
    request_properties: normalizeTradePropertyList(trade.request_properties),
    request_get_out_cards: Number(trade.request_get_out_cards) || 0,
  }
}

export function buildTradeSideItems(cash: number, propertyIndexes: unknown, jailCards = 0): TradeSideItem[] {
  const items: TradeSideItem[] = []
  if (cash > 0) items.push({ kind: 'cash', amount: cash })
  for (const index of normalizeTradePropertyList(propertyIndexes)) {
    items.push({ kind: 'property', name: spaceAt(index).name, index })
  }
  if (jailCards > 0) items.push({ kind: 'jail_cards', count: jailCards })
  return items
}

export function tradeSideHasValue(cash: number, propertyIndexes: unknown, jailCards = 0): boolean {
  return cash > 0 || normalizeTradePropertyList(propertyIndexes).length > 0 || jailCards > 0
}

export function tradeSideCountLabel(cash: number, propertyIndexes: unknown, jailCards = 0): string | null {
  const propertyCount = normalizeTradePropertyList(propertyIndexes).length
  const parts: string[] = []
  if (propertyCount > 0) parts.push(`${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'}`)
  if (cash > 0) parts.push('cash')
  if (jailCards > 0) parts.push(`${jailCards} Jail card${jailCards === 1 ? '' : 's'}`)
  if (parts.length === 0) return null
  return parts.join(' · ')
}
