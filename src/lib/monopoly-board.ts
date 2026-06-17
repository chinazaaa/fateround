/** UK Monopoly board — property names, title-deed rents, and building costs. */

export const MONOPOLY_MIN_PLAYERS = 2
export const MONOPOLY_MAX_PLAYERS = 6
export const MONOPOLY_DEFAULT_MAX_PLAYERS = 6
export const MONOPOLY_STARTING_CASH = 1500
export const MONOPOLY_GO_SALARY = 200
export const MONOPOLY_JAIL_FINE = 50
export const MONOPOLY_JAIL_POSITION = 10
export const MONOPOLY_GO_TO_JAIL_POSITION = 30
export const MONOPOLY_BOARD_SIZE = 40
export const MONOPOLY_HOUSES_IN_BANK = 32
export const MONOPOLY_HOTELS_IN_BANK = 12
export const MONOPOLY_MORTGAGE_INTEREST_RATE = 0.1

export type MonopolySpaceType =
  | 'go'
  | 'property'
  | 'station'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'community'
  | 'jail'
  | 'go_to_jail'
  | 'free_parking'

export type MonopolyColorGroup =
  | 'brown'
  | 'light_blue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'dark_blue'
  | 'station'
  | 'utility'

/** 0 = site only, 1–4 = houses, 5 = hotel */
export type BuildingLevel = 0 | 1 | 2 | 3 | 4 | 5

export interface MonopolySpace {
  index: number
  name: string
  type: MonopolySpaceType
  price?: number
  /** Site rent (no buildings). */
  rent?: number
  /** Full title deed: [site, 1 house, 2, 3, 4, hotel]. */
  rentTable?: number[]
  houseCost?: number
  color?: MonopolyColorGroup
}

export const MONOPOLY_BOARD: MonopolySpace[] = [
  { index: 0, name: 'GO', type: 'go' },
  { index: 1, name: 'Old Kent Road', type: 'property', price: 60, rent: 2, rentTable: [2, 10, 30, 90, 160, 250], houseCost: 50, color: 'brown' },
  { index: 2, name: 'Community Chest', type: 'community' },
  { index: 3, name: 'Whitechapel Road', type: 'property', price: 60, rent: 4, rentTable: [4, 20, 60, 180, 320, 450], houseCost: 50, color: 'brown' },
  { index: 4, name: 'Income Tax', type: 'tax' },
  { index: 5, name: "King's Cross Station", type: 'station', price: 200, rent: 25, color: 'station' },
  { index: 6, name: 'The Angel Islington', type: 'property', price: 100, rent: 6, rentTable: [6, 30, 90, 270, 400, 550], houseCost: 50, color: 'light_blue' },
  { index: 7, name: 'Chance', type: 'chance' },
  { index: 8, name: 'Euston Road', type: 'property', price: 100, rent: 6, rentTable: [6, 30, 90, 270, 400, 550], houseCost: 50, color: 'light_blue' },
  { index: 9, name: 'Pentonville Road', type: 'property', price: 120, rent: 8, rentTable: [8, 40, 100, 300, 450, 600], houseCost: 50, color: 'light_blue' },
  { index: 10, name: 'Jail', type: 'jail' },
  { index: 11, name: 'Pall Mall', type: 'property', price: 140, rent: 10, rentTable: [10, 50, 150, 450, 625, 750], houseCost: 50, color: 'pink' },
  { index: 12, name: 'Electric Company', type: 'utility', price: 150, color: 'utility' },
  { index: 13, name: 'Whitehall', type: 'property', price: 140, rent: 10, rentTable: [10, 50, 150, 450, 625, 750], houseCost: 50, color: 'pink' },
  { index: 14, name: 'Northumberland Avenue', type: 'property', price: 160, rent: 12, rentTable: [12, 60, 180, 500, 700, 900], houseCost: 50, color: 'pink' },
  { index: 15, name: 'Marylebone Station', type: 'station', price: 200, rent: 25, color: 'station' },
  { index: 16, name: 'Bow Street', type: 'property', price: 180, rent: 14, rentTable: [14, 70, 200, 550, 750, 900], houseCost: 100, color: 'orange' },
  { index: 17, name: 'Community Chest', type: 'community' },
  { index: 18, name: 'Marlborough Street', type: 'property', price: 180, rent: 14, rentTable: [14, 70, 200, 550, 750, 900], houseCost: 100, color: 'orange' },
  { index: 19, name: 'Vine Street', type: 'property', price: 200, rent: 16, rentTable: [16, 80, 220, 600, 800, 1000], houseCost: 100, color: 'orange' },
  { index: 20, name: 'Free Parking', type: 'free_parking' },
  { index: 21, name: 'The Strand', type: 'property', price: 220, rent: 18, rentTable: [18, 90, 250, 700, 875, 1050], houseCost: 100, color: 'red' },
  { index: 22, name: 'Chance', type: 'chance' },
  { index: 23, name: 'Fleet Street', type: 'property', price: 220, rent: 18, rentTable: [18, 90, 250, 700, 875, 1050], houseCost: 100, color: 'red' },
  { index: 24, name: 'Trafalgar Square', type: 'property', price: 240, rent: 20, rentTable: [20, 100, 300, 750, 925, 1100], houseCost: 100, color: 'red' },
  { index: 25, name: 'Fenchurch Street Station', type: 'station', price: 200, rent: 25, color: 'station' },
  { index: 26, name: 'Leicester Square', type: 'property', price: 260, rent: 22, rentTable: [22, 110, 330, 800, 975, 1150], houseCost: 150, color: 'yellow' },
  { index: 27, name: 'Coventry Street', type: 'property', price: 260, rent: 22, rentTable: [22, 110, 330, 800, 975, 1150], houseCost: 150, color: 'yellow' },
  { index: 28, name: 'Water Works', type: 'utility', price: 150, color: 'utility' },
  { index: 29, name: 'Piccadilly', type: 'property', price: 280, rent: 24, rentTable: [24, 120, 360, 850, 1025, 1200], houseCost: 150, color: 'yellow' },
  { index: 30, name: 'Go To Jail', type: 'go_to_jail' },
  { index: 31, name: 'Regent Street', type: 'property', price: 300, rent: 26, rentTable: [26, 130, 390, 900, 1100, 1275], houseCost: 150, color: 'green' },
  { index: 32, name: 'Oxford Street', type: 'property', price: 300, rent: 26, rentTable: [26, 130, 390, 900, 1100, 1275], houseCost: 150, color: 'green' },
  { index: 33, name: 'Community Chest', type: 'community' },
  { index: 34, name: 'Bond Street', type: 'property', price: 320, rent: 28, rentTable: [28, 150, 450, 1000, 1200, 1400], houseCost: 150, color: 'green' },
  { index: 35, name: 'Liverpool Street Station', type: 'station', price: 200, rent: 25, color: 'station' },
  { index: 36, name: 'Chance', type: 'chance' },
  { index: 37, name: 'Park Lane', type: 'property', price: 350, rent: 35, rentTable: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, color: 'dark_blue' },
  { index: 38, name: 'Super Tax', type: 'tax' },
  { index: 39, name: 'Mayfair', type: 'property', price: 400, rent: 50, rentTable: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, color: 'dark_blue' },
]

export const MONOPOLY_COLOR_CLASSES: Record<MonopolyColorGroup, string> = {
  brown: 'bg-amber-900',
  light_blue: 'bg-sky-400',
  pink: 'bg-pink-400',
  orange: 'bg-orange-500',
  red: 'bg-red-600',
  yellow: 'bg-yellow-400',
  green: 'bg-emerald-600',
  dark_blue: 'bg-blue-800',
  station: 'bg-neutral-700',
  utility: 'bg-neutral-500',
}

const COLOR_GROUP_SIZES: Record<MonopolyColorGroup, number> = {
  brown: 2,
  light_blue: 3,
  pink: 3,
  orange: 3,
  red: 3,
  yellow: 3,
  green: 3,
  dark_blue: 2,
  station: 4,
  utility: 2,
}

export function formatMonopolyMoney(amount: number): string {
  return `£${amount.toLocaleString('en-GB')}`
}

export function spaceAt(index: number): MonopolySpace {
  const normalized = ((index % MONOPOLY_BOARD_SIZE) + MONOPOLY_BOARD_SIZE) % MONOPOLY_BOARD_SIZE
  return MONOPOLY_BOARD[normalized]!
}

export function spacesInGroup(group: MonopolyColorGroup): MonopolySpace[] {
  return MONOPOLY_BOARD.filter((s) => s.color === group && (s.type === 'property' || s.type === 'station' || s.type === 'utility'))
}

export function mortgageValue(space: MonopolySpace): number {
  return Math.floor((space.price ?? 0) / 2)
}

export function unmortgageCost(space: MonopolySpace): number {
  const base = mortgageValue(space)
  return base + Math.ceil(base * MONOPOLY_MORTGAGE_INTEREST_RATE)
}

export function countOwnedInGroup(
  owners: Record<string, string>,
  ownerId: string,
  group: MonopolyColorGroup
): number {
  return MONOPOLY_BOARD.filter(
    (s) => s.color === group && owners[String(s.index)] === ownerId
  ).length
}

export function ownsColorMonopoly(
  owners: Record<string, string>,
  ownerId: string,
  group: MonopolyColorGroup
): boolean {
  if (group === 'station' || group === 'utility') {
    return countOwnedInGroup(owners, ownerId, group) === COLOR_GROUP_SIZES[group]
  }
  return countOwnedInGroup(owners, ownerId, group) === COLOR_GROUP_SIZES[group]
}

export function groupHasMortgage(
  group: MonopolyColorGroup,
  ownerId: string,
  owners: Record<string, string>,
  mortgaged: Record<string, boolean>
): boolean {
  return MONOPOLY_BOARD.some(
    (s) => s.color === group && owners[String(s.index)] === ownerId && mortgaged[String(s.index)]
  )
}

export function nearestSpaceFrom(
  from: number,
  type: 'station' | 'utility',
  forward = true
): number {
  const indices = MONOPOLY_BOARD.filter((s) => s.type === type).map((s) => s.index)
  if (!forward) {
    const sorted = [...indices].filter((i) => i <= from).sort((a, b) => b - a)
    return sorted[0] ?? indices[indices.length - 1]!
  }
  const next = indices.find((i) => i > from)
  return next ?? indices[0]!
}
