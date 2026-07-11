import { MONOPOLY_BOARD, type MonopolySpaceType } from '@fateround/shared/monopoly-board'

/**
 * Mobile-native port of the web `monopoly-themes.ts`. The web version is built on
 * Tailwind utility classes and `@/types`, neither of which exist in the Expo app,
 * so this is a self-contained edition registry that expresses the same intent with
 * plain hex colors + string maps. Kept in the monopoly game dir so it can't collide
 * with sibling agents.
 *
 * Covered editions: Classic (default), Pirate, Arctic, Naija — matching the host
 * lobby theme picker. Themed money symbol, per-space names, board palette, themed
 * type icons and an ambient decoration flag (Arctic snowfall).
 */

export interface MonopolyBoardPalette {
  /** Outer board background */
  boardBg: string
  /** Outer board border */
  boardBorder: string
  /** Center panel cell background */
  centerBg: string
  /** Individual tile background */
  tileBg: string
  /** Corner-tile background */
  cornerBg: string
  /** Tile space-name text color */
  tileText: string
  /** Highlighted (pending) space border */
  highlightBorder: string
  /** Ambient decoration overlay */
  decoration: 'none' | 'pirate' | 'arctic' | 'naija'
}

interface MonopolyEdition {
  themeId: string
  currencySymbol: string
  currencyWord: string
  /** Money multiplier for display (Naija shows values ×1000). */
  moneyScale: number
  editionSubtitle: string
  boardTitle: string
  spaceNames: Partial<Record<number, string>>
  typeIcons: Partial<Record<MonopolySpaceType, string>>
  boardPalette: MonopolyBoardPalette
}

const CLASSIC_PALETTE: MonopolyBoardPalette = {
  boardBg: '#14532d',
  boardBorder: '#166534',
  centerBg: '#166534',
  tileBg: '#f5f5dc',
  cornerBg: '#fef9c3',
  tileText: '#171717',
  highlightBorder: '#f43f5e',
  decoration: 'none',
}

const PIRATE_PALETTE: MonopolyBoardPalette = {
  boardBg: '#0B2545',
  boardBorder: '#B8860B',
  centerBg: '#0e2c52',
  tileBg: '#F4EBD9',
  cornerBg: '#EFE3C8',
  tileText: '#2B1B0E',
  highlightBorder: '#D4AF37',
  decoration: 'pirate',
}

const ARCTIC_PALETTE: MonopolyBoardPalette = {
  boardBg: '#15384D',
  boardBorder: '#3FA9A0',
  centerBg: '#10263C',
  tileBg: '#F8FBFC',
  cornerBg: '#EAF2F5',
  tileText: '#1B2A32',
  highlightBorder: '#3FA9A0',
  decoration: 'arctic',
}

const NAIJA_PALETTE: MonopolyBoardPalette = {
  boardBg: '#0B1F16',
  boardBorder: '#008751',
  centerBg: '#0E261B',
  tileBg: '#F9F5EE',
  cornerBg: '#F4EDE1',
  tileText: '#1A1F1C',
  highlightBorder: '#D9A441',
  decoration: 'naija',
}

const CLASSIC_EDITION: MonopolyEdition = {
  themeId: 'default',
  currencySymbol: '£',
  currencyWord: 'pounds',
  moneyScale: 1,
  editionSubtitle: 'UK Edition',
  boardTitle: 'MONOPOLY',
  spaceNames: {},
  typeIcons: {},
  boardPalette: CLASSIC_PALETTE,
}

const PIRATE_EDITION: MonopolyEdition = {
  themeId: 'pirate',
  currencySymbol: 'Đ',
  currencyWord: 'doubloons',
  moneyScale: 1,
  editionSubtitle: 'High Seas Edition',
  boardTitle: 'PLUNDER',
  typeIcons: {
    go: '⚓',
    chance: '🗺️',
    community: '🏴‍☠️',
    tax: '💀',
    jail: '⛓️',
    go_to_jail: '🦜',
    free_parking: '🏝️',
    station: '⛵',
    utility: '🔱',
  },
  spaceNames: {
    0: 'Port Royale',
    1: 'Tortuga',
    2: "Captain's Log",
    3: 'Sainte-Marie',
    4: 'Harbor Toll',
    5: "Q.A.'s Revenge",
    6: 'Santo Domingo',
    7: "Ship's Log",
    8: 'San Juan',
    9: 'Cartagena',
    10: "Hangman's Dock",
    11: 'St. Lucia',
    12: "Ship's Compass",
    13: 'St. Kitts',
    14: 'Kingston',
    15: 'Whydah Galley',
    16: 'Havana',
    17: "Captain's Log",
    18: 'Aruba',
    19: 'Veracruz',
    20: 'Safe Anchor',
    21: 'Portobelo',
    22: "Ship's Log",
    23: 'Tobago',
    24: 'Ocracoke Inlet',
    25: 'Royal Fortune',
    26: 'Grand Bahama',
    27: 'Bermuda',
    28: 'Spyglass Watch',
    29: 'Barbados',
    30: 'Marooned',
    31: 'Cape Fear',
    32: 'Cayman Islands',
    33: "Captain's Log",
    34: 'Grenada',
    35: 'Adventure Galley',
    36: "Ship's Log",
    37: 'Grand Cayman',
    38: 'Plunder Tax',
    39: 'Nassau',
  },
  boardPalette: PIRATE_PALETTE,
}

const ARCTIC_EDITION: MonopolyEdition = {
  themeId: 'arctic',
  currencySymbol: 'Ɨ',
  currencyWord: 'shards',
  moneyScale: 1,
  editionSubtitle: 'Polar Edition',
  boardTitle: 'EXPEDITION',
  typeIcons: {
    go: '🧊',
    chance: '🧭',
    community: '⛺',
    tax: '❄️',
    jail: '🏔️',
    go_to_jail: '🛷',
    free_parking: '🔥',
    station: '🚉',
    utility: '⚡',
  },
  spaceNames: {
    0: 'Base Camp',
    1: 'Klondike Trail',
    2: 'Supply Cache',
    3: 'Donner Pass',
    4: 'Ice Toll',
    5: 'McMurdo Station',
    6: 'Svalbard',
    7: 'Polar Compass',
    8: 'Lapland',
    9: 'Glacier Bay',
    10: 'Shelter Camp',
    11: 'Lake Louise',
    12: 'Northern Lights',
    13: 'Columbia Icefield',
    14: 'Hubbard Glacier',
    15: 'Zermatt Station',
    16: 'Chamonix',
    17: 'Supply Cache',
    18: 'Aspen',
    19: 'Whistler',
    20: 'Winter Feast',
    21: 'Yukon Trail',
    22: 'Polar Compass',
    23: 'Alaska Highway',
    24: 'Denali',
    25: 'Summit Station',
    26: 'Matterhorn',
    27: 'Mont Blanc',
    28: 'Hot Springs',
    29: 'Everest Base',
    30: 'Snow Storm',
    31: 'Ross Ice Shelf',
    32: 'K2 Mountain',
    33: 'Supply Cache',
    34: 'Mount Everest',
    35: 'Vostok Station',
    36: 'Polar Compass',
    37: 'South Pole',
    38: 'Khumbu Icefall',
    39: 'North Pole',
  },
  boardPalette: ARCTIC_PALETTE,
}

const NAIJA_EDITION: MonopolyEdition = {
  themeId: 'naija',
  currencySymbol: '₦',
  currencyWord: 'naira',
  moneyScale: 1000,
  editionSubtitle: 'Naija Edition',
  boardTitle: 'COMMERCE',
  typeIcons: {
    go: '🛍️',
    chance: '🎲',
    community: '🤝',
    tax: '🧾',
    jail: '🔒',
    go_to_jail: '🚨',
    free_parking: '🅿️',
    station: '🚆',
    utility: '💡',
  },
  spaceNames: {
    0: 'Oshodi Bus Terminal',
    1: 'Oshodi Market',
    2: 'Esusu Fund',
    3: 'Sabon Gari',
    4: 'LGA Market Levy',
    5: 'Iddo Railway Terminal',
    6: 'Ariaria Market',
    7: 'Trade Venture',
    8: 'Niger Bridge',
    9: 'Ogbunike Caves',
    10: 'Kirikiri',
    11: 'Yankari Reserve',
    12: 'NEPA / PHCN',
    13: 'Ogbete Market',
    14: 'Kurmi Market',
    15: 'Abuja Metro Station',
    16: 'Mile 12 Market',
    17: 'Market Guild',
    18: 'Millennium Park',
    19: 'Trans Ekulu',
    20: 'Obalende Park',
    21: 'Bodija Market',
    22: 'Trade Venture',
    23: 'Omu Resort',
    24: 'Osogbo Grove',
    25: 'Port Harcourt Terminus',
    26: 'Cocoa House',
    27: 'Aba Mills',
    28: 'Water Board',
    29: 'Tin Can Island',
    30: 'Taskforce Arrest',
    31: 'Allen Avenue',
    32: 'Ikogosi Resort',
    33: 'Esusu Fund',
    34: 'Ahmadu Bello Way',
    35: 'Aba Bus Terminal',
    36: 'Trade Venture',
    37: 'Wuse II',
    38: 'FIRS Luxury Tax',
    39: 'Eko Hotels',
  },
  boardPalette: NAIJA_PALETTE,
}

const EDITIONS: MonopolyEdition[] = [CLASSIC_EDITION, PIRATE_EDITION, ARCTIC_EDITION, NAIJA_EDITION]
const EDITION_MAP: Record<string, MonopolyEdition> = Object.fromEntries(EDITIONS.map((e) => [e.themeId, e]))

export function getMonopolyEdition(themeId?: string | null): MonopolyEdition {
  if (!themeId) return CLASSIC_EDITION
  return EDITION_MAP[themeId] ?? CLASSIC_EDITION
}

/** Format a canonical money amount with the active edition's currency symbol + scale. */
export function formatThemedMoney(amount: number, themeId?: string | null): string {
  const edition = getMonopolyEdition(themeId)
  const displayVal = amount * edition.moneyScale
  return `${edition.currencySymbol}${displayVal.toLocaleString('en-GB')}`
}

/** Themed display name for a space, falling back to the canonical name. */
export function themedSpaceName(canonicalName: string, spaceIndex: number, themeId?: string | null): string {
  const edition = getMonopolyEdition(themeId)
  return edition.spaceNames[spaceIndex] ?? canonicalName
}

/** Themed icon for a space type, or '' when the edition has no override. */
export function themedSpaceIcon(spaceType: MonopolySpaceType, themeId?: string | null): string {
  const edition = getMonopolyEdition(themeId)
  return edition.typeIcons[spaceType] ?? ''
}

/** Board visual palette for a theme. */
export function getBoardPalette(themeId?: string | null): MonopolyBoardPalette {
  return getMonopolyEdition(themeId).boardPalette
}

export function getEditionSubtitle(themeId?: string | null): string {
  return getMonopolyEdition(themeId).editionSubtitle
}

export function getBoardTitle(themeId?: string | null): string {
  return getMonopolyEdition(themeId).boardTitle
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Translate canonical UK space names + £ currency inside a status/card string to the active theme. */
export function formatThemedText(text: string | null | undefined, themeId?: string | null): string {
  if (!text) return ''
  const edition = getMonopolyEdition(themeId)
  if (edition.themeId === 'default') return text

  let formatted = text
  const spacesSorted = [...MONOPOLY_BOARD].sort((a, b) => b.name.length - a.name.length)
  for (const space of spacesSorted) {
    const themed = edition.spaceNames[space.index]
    if (themed && themed !== space.name) {
      const pattern = new RegExp(`\\b${escapeRegExp(space.name)}\\b`, 'g')
      formatted = formatted.replace(pattern, themed)
    }
  }

  if (edition.moneyScale !== 1) {
    formatted = formatted.replace(/£(\d+(?:,\d+)*(?:\.\d+)?)/g, (_, numStr: string) => {
      const num = parseFloat(numStr.replace(/,/g, ''))
      return `${edition.currencySymbol}${(num * edition.moneyScale).toLocaleString('en-GB')}`
    })
  } else {
    formatted = formatted.replace(/£(\d+(?:,\d+)*(?:\.\d+)?)/g, `${edition.currencySymbol}$1`)
  }
  formatted = formatted.replace(/£/g, edition.currencySymbol)
  if (edition.currencyWord !== 'pounds') {
    formatted = formatted.replace(/\bpounds\b/g, edition.currencyWord)
    formatted = formatted.replace(/\bPounds\b/g, edition.currencyWord[0].toUpperCase() + edition.currencyWord.slice(1))
  }
  return formatted
}
