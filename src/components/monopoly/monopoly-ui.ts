import type { MonopolySpaceType } from '@/lib/monopoly'

export const PLAYER_TOKEN_COLORS = [
  { bg: 'bg-red-500', ring: 'ring-red-400', text: 'text-red-100', hex: '#ef4444' },
  { bg: 'bg-blue-500', ring: 'ring-blue-400', text: 'text-blue-100', hex: '#3b82f6' },
  { bg: 'bg-emerald-500', ring: 'ring-emerald-400', text: 'text-emerald-100', hex: '#22c55e' },
  { bg: 'bg-amber-500', ring: 'ring-amber-400', text: 'text-amber-100', hex: '#f59e0b' },
  { bg: 'bg-violet-500', ring: 'ring-violet-400', text: 'text-violet-100', hex: '#8b5cf6' },
  { bg: 'bg-pink-500', ring: 'ring-pink-400', text: 'text-pink-100', hex: '#ec4899' },
] as const

export function tokenColorForOrder(order: number) {
  return PLAYER_TOKEN_COLORS[order % PLAYER_TOKEN_COLORS.length]!
}

export function spaceIcon(type: MonopolySpaceType): string {
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

export function shortSpaceName(name: string, max = 12): string {
  if (name.length <= max) return name
  const parts = name.split(' ')
  if (parts.length > 1 && parts[0]!.length <= max - 2) return `${parts[0]}…`
  return `${name.slice(0, max - 1)}…`
}

export type BoardEdge = 'bottom' | 'left' | 'top' | 'right' | 'corner'

export function boardEdgeForSpace(index: number): BoardEdge {
  if (index === 0 || index === 10 || index === 20 || index === 30) return 'corner'
  if (index >= 1 && index <= 9) return 'bottom'
  if (index >= 11 && index <= 19) return 'left'
  if (index >= 21 && index <= 29) return 'top'
  return 'right'
}

/** Grid cell (1–11) for the 11×11 classic board layout. */
export function boardGridCell(index: number): { col: number; row: number } {
  if (index === 20) return { col: 1, row: 1 }
  if (index === 30) return { col: 11, row: 1 }
  if (index === 10) return { col: 1, row: 11 }
  if (index === 0) return { col: 11, row: 11 }
  if (index >= 21 && index <= 29) return { col: index - 19, row: 1 }
  if (index >= 11 && index <= 19) return { col: 1, row: 21 - index }
  if (index >= 31 && index <= 39) return { col: 11, row: index - 29 }
  if (index >= 1 && index <= 9) return { col: 11 - index, row: 11 }
  return { col: 1, row: 1 }
}

/** Multi-line labels for board tiles — full words, split across lines (UK edition). */
export function boardSpaceLines(name: string, type: MonopolySpaceType): string[] {
  const known: Record<string, string[]> = {
    GO: ['GO', '→'],
    Jail: ['Jail', '🔒'],
    'Free Parking': ['Free', 'Parking'],
    'Go To Jail': ['Go To', 'Jail'],
    'Income Tax': ['Income', 'Tax'],
    'Super Tax': ['Super', 'Tax'],
    'Community Chest': ['Community', 'Chest'],
    Chance: ['Chance', '?'],
    'Old Kent Road': ['Old Kent', 'Road'],
    'Whitechapel Road': ['Whitechapel', 'Road'],
    'The Angel Islington': ['Angel', 'Islington'],
    'Euston Road': ['Euston', 'Road'],
    'Pentonville Road': ['Pentonville', 'Road'],
    'Pall Mall': ['Pall', 'Mall'],
    Whitehall: ['Whitehall'],
    'Northumberland Avenue': ['Northumberland', 'Avenue'],
    'Bow Street': ['Bow', 'Street'],
    'Marlborough Street': ['Marlborough', 'Street'],
    'Vine Street': ['Vine', 'Street'],
    'The Strand': ['The', 'Strand'],
    'Fleet Street': ['Fleet', 'Street'],
    'Trafalgar Square': ['Trafalgar', 'Square'],
    'Leicester Square': ['Leicester', 'Square'],
    'Coventry Street': ['Coventry', 'Street'],
    Piccadilly: ['Piccadilly'],
    'Regent Street': ['Regent', 'Street'],
    'Oxford Street': ['Oxford', 'Street'],
    'Bond Street': ['Bond', 'Street'],
    'Park Lane': ['Park', 'Lane'],
    Mayfair: ['Mayfair'],
    "King's Cross Station": ["King's Cross", 'Station'],
    'Marylebone Station': ['Marylebone', 'Station'],
    'Fenchurch Street Station': ['Fenchurch St', 'Station'],
    'Liverpool Street Station': ['Liverpool', 'Station'],
    'Electric Company': ['Electric', 'Company'],
    'Water Works': ['Water', 'Works'],
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

export function gridPositionForSpace(index: number): { row: number; col: number } {
  if (index <= 10) return { row: 10, col: 10 - index }
  if (index <= 19) return { row: 19 - index, col: 0 }
  if (index <= 30) return { row: 0, col: index - 20 }
  return { row: index - 30, col: 10 }
}

export const DICE_PIPS: Record<number, number[][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
}
