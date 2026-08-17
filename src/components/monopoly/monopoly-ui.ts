import type { MonopolyBoardSize, MonopolySpaceType } from '@/lib/monopoly'
import { themedSpaceIcon, themedSpaceLines, themedSpaceName } from '@/components/monopoly/monopoly-themes'

export const PLAYER_TOKEN_COLORS = [
  { bg: 'bg-red-500', ring: 'ring-red-400', text: 'text-red-100', hex: '#ef4444' },
  { bg: 'bg-blue-500', ring: 'ring-blue-400', text: 'text-blue-100', hex: '#3b82f6' },
  { bg: 'bg-emerald-500', ring: 'ring-emerald-400', text: 'text-emerald-100', hex: '#22c55e' },
  { bg: 'bg-amber-500', ring: 'ring-amber-400', text: 'text-amber-100', hex: '#f59e0b' },
  { bg: 'bg-violet-500', ring: 'ring-violet-400', text: 'text-violet-100', hex: '#8b5cf6' },
  { bg: 'bg-pink-500', ring: 'ring-pink-400', text: 'text-pink-100', hex: '#ec4899' },
  { bg: 'bg-cyan-500', ring: 'ring-cyan-400', text: 'text-cyan-100', hex: '#06b6d4' },
  { bg: 'bg-lime-500', ring: 'ring-lime-400', text: 'text-lime-950', hex: '#84cc16' },
] as const

export function tokenColorForOrder(order: number) {
  return PLAYER_TOKEN_COLORS[order % PLAYER_TOKEN_COLORS.length]!
}

export function spaceIcon(type: MonopolySpaceType, themeId?: string | null): string {
  if (themeId) {
    const themed = themedSpaceIcon(type, themeId)
    if (themed) return themed
  }
  switch (type) {
    case 'go':
      return '→'
    case 'chance':
      return '?'
    case 'community':
      return '🎁'
    case 'tax':
      return '💸'
    case 'jail':
      return '🔒'
    case 'go_to_jail':
      return '👮'
    case 'free_parking':
      return '🅿️'
    case 'station':
      return '🚂'
    case 'utility':
      return '💡'
    default:
      return ''
  }
}

export function shortSpaceName(
  name: string,
  max = 12,
  spaceIndex?: number,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = 40
): string {
  const displayName = spaceIndex != null ? themedSpaceName(name, spaceIndex, themeId, boardSize) : name
  if (displayName.length <= max) return displayName
  const parts = displayName.trim().split(/\s+/)
  if (parts.length > 1 && parts[0]!.length >= 3 && parts[0]!.length <= max) return parts[0]!
  return `${displayName.slice(0, max - 1)}…`
}

export function shortPlayerName(name: string, max = 12): string {
  if (name.length <= max) return name
  const parts = name.trim().split(/\s+/)
  if (parts.length > 1 && parts[0]!.length >= 3 && parts[0]!.length <= max) return parts[0]!
  return `${name.slice(0, max - 1)}…`
}

export type BoardEdge = 'bottom' | 'left' | 'top' | 'right' | 'corner'

export function boardEdgeForSpace(index: number, boardSize: MonopolyBoardSize = 40): BoardEdge {
  const sideLength = boardSize / 4
  if (index % sideLength === 0) return 'corner'
  if (index < sideLength) return 'bottom'
  if (index < sideLength * 2) return 'left'
  if (index < sideLength * 3) return 'top'
  return 'right'
}

/** Grid cell for either the 11×11 or 13×13 Estate Kings board. */
export function boardGridCell(index: number, boardSize: MonopolyBoardSize = 40): { col: number; row: number } {
  const sideLength = boardSize / 4
  const gridSize = sideLength + 1
  if (index === sideLength * 2) return { col: 1, row: 1 }
  if (index === sideLength * 3) return { col: gridSize, row: 1 }
  if (index === sideLength) return { col: 1, row: gridSize }
  if (index === 0) return { col: gridSize, row: gridSize }
  if (index > sideLength * 2 && index < sideLength * 3) return { col: index - sideLength * 2 + 1, row: 1 }
  if (index > sideLength && index < sideLength * 2) return { col: 1, row: sideLength * 2 + 1 - index }
  if (index > sideLength * 3) return { col: gridSize, row: index - sideLength * 3 + 1 }
  if (index > 0 && index < sideLength) return { col: gridSize - index, row: gridSize }
  return { col: 1, row: 1 }
}

/** Multi-line labels for board tiles — full words, split across lines. Themed editions override via spaceIndex + themeId. */
export function boardSpaceLines(
  name: string,
  type: MonopolySpaceType,
  spaceIndex?: number,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = 40
): string[] {
  if (spaceIndex != null) {
    const themed = themedSpaceLines(name, type, spaceIndex, themeId, boardSize)
    if (themed) return themed
  }
  const known: Record<string, string[]> = {
    PAYDAY: ['PAYDAY', '→'],
    NICKED: ['NICKED', '🔒'],
    'LAY-BY': ['LAY-BY'],
    'OFF TO JAIL': ['OFF TO', 'JAIL'],
    'TAX OFFICE': ['TAX', 'OFFICE'],
    SURCHARGE: ['SURCHARGE'],
    Kitty: ['Kitty'],
    Fate: ['Fate', '?'],
    'Market Shock': ['Market', 'Shock'],
    'Community Grant': ['Community', 'Grant'],
    'Esusu Fund': ['Esusu', 'Fund'],
    'Luxury Tax': ['Luxury', 'Tax'],
    // Properties
    'Barking Road': ['Barking', 'Road'],
    'Dagenham Avenue': ['Dagenham', 'Avenue'],
    'Dagenham Ave': ['Dagenham', 'Ave'],
    'Thamesmead Walk': ['Thamesmead', 'Walk'],
    'Croydon High Street': ['Croydon', 'High St'],
    'Croydon High': ['Croydon', 'High'],
    'Erith Road': ['Erith', 'Road'],
    'Ilford Lane': ['Ilford', 'Lane'],
    'Romford Road': ['Romford', 'Road'],
    'Enfield Town': ['Enfield', 'Town'],
    'Walthamstow Market': ['Walthamstow', 'Market'],
    'Peckham Rye': ['Peckham', 'Rye'],
    'Deptford Broadway': ['Deptford', 'Broadway'],
    'Deptford Way': ['Deptford', 'Way'],
    'Canary Wharf': ['Canary', 'Wharf'],
    Bermondsey: ['Bermondsey'],
    Limehouse: ['Limehouse'],
    Hampstead: ['Hampstead'],
    Islington: ['Islington'],
    'Stratford Cross': ['Stratford', 'Cross'],
    'Hackney Wick': ['Hackney', 'Wick'],
    'Brixton Hill': ['Brixton', 'Hill'],
    Shoreditch: ['Shoreditch'],
    'Kings Cross': ['Kings', 'Cross'],
    'Clapham Common': ['Clapham', 'Common'],
    'Fulham Broadway': ['Fulham', 'Broadway'],
    'Battersea Rise': ['Battersea', 'Rise'],
    'Marylebone Lane': ['Marylebone', 'Lane'],
    'Notting Hill Gate': ['Notting Hill', 'Gate'],
    'Notting Hill': ['Notting', 'Hill'],
    'South Kensington': ['South', 'Kensington'],
    'Chester Square': ['Chester', 'Square'],
    'Winnington Road': ['Winnington', 'Road'],
    'Kensington Mews': ['Kensington', 'Mews'],
    'Regent Street': ['Regent', 'Street'],
    'Mayfair Mews': ['Mayfair', 'Mews'],
    // Stations (no "Station" suffix on the London board)
    Paddington: ['Paddington'],
    Waterloo: ['Waterloo'],
    Victoria: ['Victoria'],
    'London Bridge': ['London', 'Bridge'],
    // Utilities
    'Power Company': ['Power', 'Company'],
    'Water Board': ['Water', 'Board'],
  }
  if (known[name]) return known[name]
  if (type === 'station') {
    const label = name.replace(' Station', '')
    const words = label.split(' ')
    if (words.length >= 2) {
      return [`${words.slice(0, -1).join(' ')}`, 'Station']
    }
    return [label, 'Station']
  }
  if (type === 'utility') {
    const parts = name.split(' ')
    return parts.length > 1 ? [parts[0]!, parts.slice(1).join(' ')] : [name]
  }
  if (name.endsWith(' Road')) return [name.replace(' Road', ''), 'Road']
  if (name.endsWith(' Street')) return [name.replace(' Street', ''), 'Street']
  if (name.endsWith(' Square')) return [name.replace(' Square', ''), 'Square']
  if (name.endsWith(' Avenue')) return [name.replace(' Avenue', ''), 'Avenue']
  const parts = name.split(' ')
  if (parts.length <= 2) return parts
  return [parts.slice(0, 2).join(' '), parts.slice(2).join(' ')]
}

export function mobileBoardSpaceLines(
  name: string,
  type: MonopolySpaceType,
  spaceIndex?: number,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = 40
): string[] {
  const fullLines = boardSpaceLines(name, type, spaceIndex, themeId, boardSize)
  const abbrMap: Record<string, string> = {
    Avenue: 'Ave',
    Street: 'St',
    Road: 'Rd',
    Station: 'Stn',
    Square: 'Sq',
    Company: 'Co',
    Walthamstow: 'W-stow',
    Thamesmead: 'T-mead',
    Battersea: "B'sea",
    Winnington: "W'ton",
    Kensington: 'Ken.',
    Community: 'Comm.',
  }
  const words: string[] = []
  for (const line of fullLines) {
    let shortened = line
    if (shortened.includes('AHMADU')) {
      words.push('AHMADU B.')
      continue
    }
    if (shortened.includes('BELLO')) {
      if (shortened.includes('WAY')) {
        words.push('WAY')
      }
      continue
    }
    if (shortened.trim() === 'TIN CAN' || shortened.includes('NEPA') || shortened.trim() === 'MILE 12') {
      if (shortened.includes('NEPA')) {
        words.push('NEPA / ')
      } else {
        words.push(shortened.trim())
      }
      continue
    }

    for (const [full, short] of Object.entries(abbrMap)) {
      if (shortened === full) {
        shortened = short
      } else if (shortened.includes(full)) {
        shortened = shortened.replace(full, short)
      }
    }
    const splitWords = shortened.trim().split(/\s+/)
    for (const word of splitWords) {
      if (word.length > 8) {
        words.push(`${word.slice(0, 7)}.`)
      } else if (word) {
        words.push(word)
      }
    }
  }
  return words
}

export function gridPositionForSpace(index: number): { row: number; col: number } {
  if (index <= 10) return { row: 10, col: 10 - index }
  if (index <= 19) return { row: 19 - index, col: 0 }
  if (index <= 30) return { row: 0, col: index - 20 }
  return { row: index - 30, col: 10 }
}

export const DICE_PIPS: Record<number, number[][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  4: [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ],
  5: [
    [0, 0],
    [0, 2],
    [1, 1],
    [2, 0],
    [2, 2],
  ],
  6: [
    [0, 0],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 2],
  ],
}
