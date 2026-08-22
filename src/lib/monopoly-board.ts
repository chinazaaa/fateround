/** London Edition board — property names, title-deed rents, and building costs. */

export const MONOPOLY_MIN_PLAYERS = 2
export const MONOPOLY_MAX_PLAYERS = 9
export const MONOPOLY_DEFAULT_MAX_PLAYERS = 6
export const MONOPOLY_STARTING_CASH = 1500
export const MONOPOLY_EXPANDED_STARTING_CASH = 6000

export function startingCashForSize(boardSize: MonopolyBoardSize = 40): number {
  return boardSize === 48 ? MONOPOLY_EXPANDED_STARTING_CASH : MONOPOLY_STARTING_CASH
}
export const MONOPOLY_GO_SALARY = 200
export const MONOPOLY_EXPANDED_GO_SALARY = 800

export function goSalaryForSize(boardSize: MonopolyBoardSize = 40): number {
  return boardSize === 48 ? MONOPOLY_EXPANDED_GO_SALARY : MONOPOLY_GO_SALARY
}
export const MONOPOLY_JAIL_FINE = 50
export const MONOPOLY_JAIL_POSITION = 10
export const MONOPOLY_GO_TO_JAIL_POSITION = 30
export const MONOPOLY_BOARD_SIZE = 40
export const MONOPOLY_EXPANDED_BOARD_SIZE = 48
export type MonopolyBoardSize = typeof MONOPOLY_BOARD_SIZE | typeof MONOPOLY_EXPANDED_BOARD_SIZE

export function jailPositionForSize(boardSize: MonopolyBoardSize = 40): number {
  return boardSize === 48 ? 12 : MONOPOLY_JAIL_POSITION
}

export function goToJailPositionForSize(boardSize: MonopolyBoardSize = 40): number {
  return boardSize === 48 ? 36 : MONOPOLY_GO_TO_JAIL_POSITION
}
export const MONOPOLY_HOUSES_IN_BANK = 32
export const MONOPOLY_HOTELS_IN_BANK = 12
export const MONOPOLY_EXPANDED_HOUSES_IN_BANK = 48
export const MONOPOLY_EXPANDED_HOTELS_IN_BANK = 18

export function housesInBankForSize(boardSize: MonopolyBoardSize = 40): number {
  return boardSize === 48 ? MONOPOLY_EXPANDED_HOUSES_IN_BANK : MONOPOLY_HOUSES_IN_BANK
}

export function hotelsInBankForSize(boardSize: MonopolyBoardSize = 40): number {
  return boardSize === 48 ? MONOPOLY_EXPANDED_HOTELS_IN_BANK : MONOPOLY_HOTELS_IN_BANK
}
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
  | 'teal'
  | 'violet'
  | 'indigo'
  | 'coral'
  | 'station'
  | 'utility'

/** 0 = site only, 1–4 = houses, 5 = hotel. */
export type BuildingLevel = 0 | 1 | 2 | 3 | 4 | 5

export const MONOPOLY_MAX_HOUSES_PER_PROPERTY = 4
export const MONOPOLY_HOTEL_LEVEL = 5 as const
export const MONOPOLY_HOUSES_UNDER_HOTEL = 4

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
  { index: 0, name: 'PAYDAY', type: 'go' },
  {
    index: 1,
    name: 'Barking Road',
    type: 'property',
    price: 60,
    rent: 2,
    rentTable: [2, 10, 30, 90, 160, 250],
    houseCost: 50,
    color: 'brown',
  },
  { index: 2, name: 'Kitty', type: 'community' },
  {
    index: 3,
    name: 'Dagenham Avenue',
    type: 'property',
    price: 60,
    rent: 4,
    rentTable: [4, 20, 60, 180, 320, 450],
    houseCost: 50,
    color: 'brown',
  },
  { index: 4, name: 'TAX OFFICE', type: 'tax' },
  { index: 5, name: 'Paddington', type: 'station', price: 200, rent: 25, color: 'station' },
  {
    index: 6,
    name: 'Thamesmead Walk',
    type: 'property',
    price: 100,
    rent: 6,
    rentTable: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
    color: 'light_blue',
  },
  { index: 7, name: 'Fate', type: 'chance' },
  {
    index: 8,
    name: 'Croydon High Street',
    type: 'property',
    price: 100,
    rent: 6,
    rentTable: [6, 30, 90, 270, 400, 550],
    houseCost: 50,
    color: 'light_blue',
  },
  {
    index: 9,
    name: 'Erith Road',
    type: 'property',
    price: 120,
    rent: 8,
    rentTable: [8, 40, 100, 300, 450, 600],
    houseCost: 50,
    color: 'light_blue',
  },
  { index: 10, name: 'NICKED', type: 'jail' },
  {
    index: 11,
    name: 'Ilford Lane',
    type: 'property',
    price: 140,
    rent: 10,
    rentTable: [10, 50, 150, 450, 625, 750],
    houseCost: 50,
    color: 'pink',
  },
  { index: 12, name: 'Power Company', type: 'utility', price: 150, color: 'utility' },
  {
    index: 13,
    name: 'Romford Road',
    type: 'property',
    price: 140,
    rent: 10,
    rentTable: [10, 50, 150, 450, 625, 750],
    houseCost: 50,
    color: 'pink',
  },
  {
    index: 14,
    name: 'Enfield Town',
    type: 'property',
    price: 160,
    rent: 12,
    rentTable: [12, 60, 180, 500, 700, 900],
    houseCost: 50,
    color: 'pink',
  },
  { index: 15, name: 'Waterloo', type: 'station', price: 200, rent: 25, color: 'station' },
  {
    index: 16,
    name: 'Walthamstow Market',
    type: 'property',
    price: 180,
    rent: 14,
    rentTable: [14, 70, 200, 550, 750, 900],
    houseCost: 100,
    color: 'orange',
  },
  { index: 17, name: 'Kitty', type: 'community' },
  {
    index: 18,
    name: 'Peckham Rye',
    type: 'property',
    price: 180,
    rent: 14,
    rentTable: [14, 70, 200, 550, 750, 900],
    houseCost: 100,
    color: 'orange',
  },
  {
    index: 19,
    name: 'Deptford Broadway',
    type: 'property',
    price: 200,
    rent: 16,
    rentTable: [16, 80, 220, 600, 800, 1000],
    houseCost: 100,
    color: 'orange',
  },
  { index: 20, name: 'LAY-BY', type: 'free_parking' },
  {
    index: 21,
    name: 'Stratford Cross',
    type: 'property',
    price: 220,
    rent: 18,
    rentTable: [18, 90, 250, 700, 875, 1050],
    houseCost: 100,
    color: 'red',
  },
  { index: 22, name: 'Fate', type: 'chance' },
  {
    index: 23,
    name: 'Hackney Wick',
    type: 'property',
    price: 220,
    rent: 18,
    rentTable: [18, 90, 250, 700, 875, 1050],
    houseCost: 100,
    color: 'red',
  },
  {
    index: 24,
    name: 'Brixton Hill',
    type: 'property',
    price: 240,
    rent: 20,
    rentTable: [20, 100, 300, 750, 925, 1100],
    houseCost: 100,
    color: 'red',
  },
  { index: 25, name: 'Victoria', type: 'station', price: 200, rent: 25, color: 'station' },
  {
    index: 26,
    name: 'Clapham Common',
    type: 'property',
    price: 260,
    rent: 22,
    rentTable: [22, 110, 330, 800, 975, 1150],
    houseCost: 150,
    color: 'yellow',
  },
  {
    index: 27,
    name: 'Fulham Broadway',
    type: 'property',
    price: 260,
    rent: 22,
    rentTable: [22, 110, 330, 800, 975, 1150],
    houseCost: 150,
    color: 'yellow',
  },
  { index: 28, name: 'Water Board', type: 'utility', price: 150, color: 'utility' },
  {
    index: 29,
    name: 'Battersea Rise',
    type: 'property',
    price: 280,
    rent: 24,
    rentTable: [24, 120, 360, 850, 1025, 1200],
    houseCost: 150,
    color: 'yellow',
  },
  { index: 30, name: 'OFF TO JAIL', type: 'go_to_jail' },
  {
    index: 31,
    name: 'Marylebone Lane',
    type: 'property',
    price: 300,
    rent: 26,
    rentTable: [26, 130, 390, 900, 1100, 1275],
    houseCost: 150,
    color: 'green',
  },
  {
    index: 32,
    name: 'Notting Hill Gate',
    type: 'property',
    price: 300,
    rent: 26,
    rentTable: [26, 130, 390, 900, 1100, 1275],
    houseCost: 150,
    color: 'green',
  },
  { index: 33, name: 'Kitty', type: 'community' },
  {
    index: 34,
    name: 'South Kensington',
    type: 'property',
    price: 320,
    rent: 28,
    rentTable: [28, 150, 450, 1000, 1200, 1400],
    houseCost: 150,
    color: 'green',
  },
  { index: 35, name: 'London Bridge', type: 'station', price: 200, rent: 25, color: 'station' },
  { index: 36, name: 'Fate', type: 'chance' },
  {
    index: 37,
    name: 'Chester Square',
    type: 'property',
    price: 350,
    rent: 35,
    rentTable: [35, 175, 500, 1100, 1300, 1500],
    houseCost: 200,
    color: 'dark_blue',
  },
  { index: 38, name: 'SURCHARGE', type: 'tax' },
  {
    index: 39,
    name: 'Winnington Road',
    type: 'property',
    price: 400,
    rent: 50,
    rentTable: [50, 200, 600, 1400, 1700, 2000],
    houseCost: 200,
    color: 'dark_blue',
  },
]

function expandedSite(
  index: number,
  name: string,
  color: MonopolyColorGroup,
  price: number,
  rent: number,
  houseCost: number
): MonopolySpace {
  return {
    index,
    name,
    type: 'property',
    price,
    rent,
    rentTable: [rent, rent * 5, rent * 15, rent * 45, rent * 80, rent * 125],
    houseCost,
    color,
  }
}

/** 48-space Estate Kings board: every street follows 3-site / event / 2-site / terminal / 3-site / event. */
export const MONOPOLY_EXPANDED_BOARD: MonopolySpace[] = [
  { index: 0, name: 'PAYDAY', type: 'go' },
  expandedSite(1, 'Barking Road', 'brown', 60, 2, 50),
  { index: 2, name: 'Fate', type: 'chance' },
  expandedSite(3, 'Dagenham Ave', 'brown', 60, 4, 50),
  expandedSite(4, 'Thamesmead Walk', 'light_blue', 100, 6, 50),
  expandedSite(5, 'Croydon High', 'light_blue', 110, 7, 50),
  { index: 6, name: 'Paddington', type: 'station', price: 200, rent: 25, color: 'station' },
  expandedSite(7, 'Erith Road', 'light_blue', 120, 8, 50),
  expandedSite(8, 'Canary Wharf', 'indigo', 140, 10, 100),
  { index: 9, name: 'Esusu Fund', type: 'community' },
  expandedSite(10, 'Bermondsey', 'indigo', 150, 11, 100),
  expandedSite(11, 'Limehouse', 'indigo', 160, 12, 100),
  { index: 12, name: 'NICKED', type: 'jail' },
  expandedSite(13, 'Walthamstow', 'orange', 180, 14, 100),
  { index: 14, name: 'Market Shock', type: 'chance' },
  expandedSite(15, 'Peckham Rye', 'orange', 190, 15, 100),
  expandedSite(16, 'Deptford Way', 'orange', 200, 16, 100),
  expandedSite(17, 'Hampstead', 'violet', 210, 17, 100),
  { index: 18, name: 'Waterloo', type: 'station', price: 200, rent: 25, color: 'station' },
  expandedSite(19, 'Islington', 'violet', 220, 18, 100),
  expandedSite(20, 'Ilford Lane', 'pink', 230, 19, 100),
  { index: 21, name: 'Water Board', type: 'utility', price: 150, color: 'utility' },
  expandedSite(22, 'Romford Road', 'pink', 240, 20, 100),
  expandedSite(23, 'Enfield Town', 'pink', 250, 21, 100),
  { index: 24, name: 'LAY-BY', type: 'free_parking' },
  expandedSite(25, 'Stratford Cross', 'red', 260, 22, 150),
  { index: 26, name: 'Community Grant', type: 'community' },
  expandedSite(27, 'Hackney Wick', 'red', 270, 23, 150),
  expandedSite(28, 'Brixton Hill', 'red', 280, 24, 150),
  expandedSite(29, 'Shoreditch', 'teal', 290, 25, 150),
  { index: 30, name: 'Victoria', type: 'station', price: 200, rent: 25, color: 'station' },
  expandedSite(31, 'Kings Cross', 'teal', 300, 26, 150),
  expandedSite(32, 'Clapham Common', 'yellow', 310, 27, 150),
  { index: 33, name: 'Power Company', type: 'utility', price: 150, color: 'utility' },
  expandedSite(34, 'Fulham Broadway', 'yellow', 320, 28, 150),
  expandedSite(35, 'Battersea Rise', 'yellow', 330, 29, 150),
  { index: 36, name: 'OFF TO NICKED', type: 'go_to_jail' },
  expandedSite(37, 'Marylebone Lane', 'green', 340, 30, 200),
  { index: 38, name: 'Kitty', type: 'community' },
  expandedSite(39, 'Notting Hill', 'green', 350, 31, 200),
  expandedSite(40, 'South Kensington', 'green', 360, 32, 200),
  expandedSite(41, 'Chester Square', 'dark_blue', 370, 35, 200),
  { index: 42, name: 'London Bridge', type: 'station', price: 200, rent: 25, color: 'station' },
  expandedSite(43, 'Winnington Road', 'dark_blue', 380, 40, 200),
  expandedSite(44, 'Kensington Mews', 'coral', 390, 42, 200),
  { index: 45, name: 'Luxury Tax', type: 'tax' },
  expandedSite(46, 'Regent Street', 'coral', 400, 45, 200),
  expandedSite(47, 'Mayfair Mews', 'coral', 410, 48, 200),
]

export function monopolyBoardForSize(boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE): MonopolySpace[] {
  return boardSize === MONOPOLY_EXPANDED_BOARD_SIZE ? MONOPOLY_EXPANDED_BOARD : MONOPOLY_BOARD
}

export function monopolyJailPosition(boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE): number {
  return boardSize / 4
}

export function monopolyGoToJailPosition(boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE): number {
  return (boardSize / 4) * 3
}

export const MONOPOLY_COLOR_CLASSES: Record<MonopolyColorGroup, string> = {
  brown: 'bg-amber-900',
  light_blue: 'bg-sky-400',
  pink: 'bg-pink-400',
  orange: 'bg-orange-500',
  red: 'bg-red-600',
  yellow: 'bg-yellow-400',
  green: 'bg-emerald-600',
  dark_blue: 'bg-blue-800',
  teal: 'bg-teal-600',
  violet: 'bg-violet-600',
  indigo: 'bg-indigo-700',
  coral: 'bg-rose-500',
  station: 'bg-neutral-700',
  utility: 'bg-neutral-500',
}

export function formatMonopolyMoney(amount: number): string {
  return `£${amount.toLocaleString('en-GB')}`
}

export function spaceAt(index: number, boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE): MonopolySpace {
  const board = monopolyBoardForSize(boardSize)
  const normalized = ((index % boardSize) + boardSize) % boardSize
  return board[normalized]!
}

export function spacesInGroup(group: MonopolyColorGroup, boardSize: MonopolyBoardSize = 40): MonopolySpace[] {
  return monopolyBoardForSize(boardSize).filter(
    (space) =>
      space.color === group && (space.type === 'property' || space.type === 'station' || space.type === 'utility')
  )
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
  group: MonopolyColorGroup,
  boardSize: MonopolyBoardSize = 40
): number {
  return spacesInGroup(group, boardSize).filter((space) => owners[String(space.index)] === ownerId).length
}

export function ownsColorMonopoly(
  owners: Record<string, string>,
  ownerId: string,
  group: MonopolyColorGroup,
  boardSize: MonopolyBoardSize = 40
): boolean {
  const groupSize = spacesInGroup(group, boardSize).length
  return groupSize > 0 && countOwnedInGroup(owners, ownerId, group, boardSize) === groupSize
}

export function groupHasMortgage(
  group: MonopolyColorGroup,
  ownerId: string,
  owners: Record<string, string>,
  mortgaged: Record<string, boolean>,
  boardSize: MonopolyBoardSize = 40
): boolean {
  return monopolyBoardForSize(boardSize).some(
    (space) => space.color === group && owners[String(space.index)] === ownerId && mortgaged[String(space.index)]
  )
}

export function nearestSpaceFrom(
  from: number,
  type: 'station' | 'utility',
  forward = true,
  boardSize: MonopolyBoardSize = 40
): number {
  const indices = monopolyBoardForSize(boardSize)
    .filter((space) => space.type === type)
    .map((space) => space.index)
  if (!forward) {
    const sorted = [...indices].filter((i) => i <= from).sort((a, b) => b - a)
    return sorted[0] ?? indices[indices.length - 1]!
  }
  const next = indices.find((i) => i > from)
  return next ?? indices[0]!
}
