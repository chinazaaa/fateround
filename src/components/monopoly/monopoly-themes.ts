import type { ThemeId } from '@/types'
import { MONOPOLY_BOARD, type MonopolySpaceType } from '@/lib/monopoly-board'

// ---------------------------------------------------------------------------
// Edition interface
// ---------------------------------------------------------------------------

export interface MonopolyThemeEdition {
  /** Theme ID this edition maps to. */
  themeId: ThemeId
  /** Display name shown in theme picker when game type is Monopoly. */
  editionName: string
  /** Emoji shown next to the edition name in the theme picker. */
  editionEmoji: string
  /** Currency symbol prepended to money amounts (e.g. '£', 'Đ'). */
  currencySymbol: string
  /** Currency word used in prose (e.g. 'pounds', 'doubloons'). */
  currencyWord: string
  /** Themed display names keyed by space index (0–39). Missing = use canonical. */
  spaceNames: Partial<Record<number, string>>
  /** Themed icons keyed by space *type*. Missing = use default icon. */
  typeIcons: Partial<Record<MonopolySpaceType, string>>
  /** Themed two-line labels for the board grid, keyed by space index. */
  spaceLines: Partial<Record<number, string[]>>
  /** Edition subtitle shown in the board center (e.g. "UK Edition", "Pirate Edition"). */
  editionSubtitle: string
  /** Short board title shown in the center (e.g. "MONOPOLY"). */
  boardTitle: string
  /** Full visual palette for the board grid — colors, gradients, borders, etc. */
  boardPalette: MonopolyBoardPalette
}

// ---------------------------------------------------------------------------
// Board visual palette — controls the full look of the Monopoly board grid
// ---------------------------------------------------------------------------

export interface MonopolyBoardPalette {
  /** Board outer background gradient (Tailwind classes) */
  boardBg: string
  /** Board outer border color */
  boardBorder: string
  /** Board outer box-shadow */
  boardShadow: string
  /** Center panel background gradient */
  centerBg: string
  /** Center panel border color */
  centerBorder: string
  /** Center panel main text color */
  centerText: string
  /** Center panel subtle text color */
  centerSubtleText: string
  /** Center panel price highlight color */
  centerPriceText: string
  /** Center panel debt/warning price color */
  centerDebtPriceText: string
  /** Board title text color */
  titleColor: string
  /** Edition subtitle text color */
  subtitleColor: string
  /** Individual tile background */
  tileBg: string
  /** Tile default border */
  tileBorder: string
  /** Tile space-name text color */
  tileText: string
  /** Highlighted-space ring color */
  highlightRing: string
  /** Highlighted-space ring-offset color */
  highlightOffset: string
  /** Price label text color */
  priceText: string
  /** Rent label text color */
  rentText: string
  /** Corner-space divider bar */
  cornerDivider: string
  /** "My token" ring highlight */
  myTokenRing: string
  /** "My token" ring-offset */
  myTokenOffset: string
  /** Optional custom font class for the board title */
  titleFont?: string
  /** Optional custom font class for the board subtitle */
  subtitleFont?: string
  /** Optional custom font class for tile labels */
  tileFont?: string
  /** Optional custom decoration overlay */
  customDecoration?: 'pirate' | 'arctic' | 'naija' | 'none'
}

// ---------------------------------------------------------------------------
// Board palettes
// ---------------------------------------------------------------------------

const CLASSIC_PALETTE: MonopolyBoardPalette = {
  boardBg: 'bg-gradient-to-br from-emerald-800 via-emerald-900 to-teal-950',
  boardBorder: 'border-amber-700/90',
  boardShadow: 'shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]',
  centerBg: 'bg-gradient-to-br from-emerald-700/90 to-emerald-950/95',
  centerBorder: 'border-emerald-600/40',
  centerText: 'text-white',
  centerSubtleText: 'text-emerald-200/80',
  centerPriceText: 'text-amber-300',
  centerDebtPriceText: 'text-red-300',
  titleColor: 'text-amber-300',
  subtitleColor: 'text-emerald-200/70',
  tileBg: 'bg-[#faf8f2]',
  tileBorder: 'border-neutral-300/80',
  tileText: 'text-neutral-800',
  highlightRing: 'ring-amber-400',
  highlightOffset: 'ring-offset-emerald-900',
  priceText: 'text-neutral-500',
  rentText: 'text-emerald-800',
  cornerDivider: 'bg-neutral-200',
  myTokenRing: 'ring-amber-300',
  myTokenOffset: 'ring-offset-emerald-900',
}

const PIRATE_PALETTE: MonopolyBoardPalette = {
  boardBg:
    'bg-gradient-to-br from-[#E8DCC4] via-[#D9C7A3] to-[#C4AF8A] dark:from-[#113159] dark:via-[#0B2545] dark:to-[#071930]',
  boardBorder: 'border-[#B8860B]/80 dark:border-[#B8860B]/70',
  boardShadow:
    'shadow-[0_20px_60px_rgba(43,27,14,0.4),inset_0_1px_0_rgba(255,255,255,0.4)] dark:shadow-[0_20px_60px_rgba(3,11,21,0.8),inset_0_1px_0_rgba(184,134,11,0.2)]',
  centerBg:
    'bg-gradient-to-br from-[#EFE3C8]/95 via-[#E5D2AD]/90 to-[#D8C39A]/95 dark:from-[#0e2c52]/95 dark:via-[#0A2240]/90 dark:to-[#071930]/95',
  centerBorder: 'border-[#B8860B]/50 dark:border-[#B8860B]/35',
  centerText: 'text-[#2B1B0E] dark:text-white',
  centerSubtleText: 'text-[#5C3D1E] dark:text-[#E8C567]/80',
  centerPriceText: 'text-[#7A1F1F] dark:text-[#D4AF37]',
  centerDebtPriceText: 'text-[#990000] dark:text-red-400',
  titleColor: 'text-[#2B1B0E] dark:text-[#E8C567]',
  subtitleColor: 'text-[#7A1F1F] dark:text-[#C49E42]',
  tileBg: 'bg-[#F4EBD9] dark:bg-[#112E54]',
  tileBorder: 'border-[#B8860B]/50 dark:border-[#B8860B]/30',
  tileText: 'text-[#2B1B0E] dark:text-[#EFE3C8]',
  highlightRing: 'ring-[#B8860B] dark:ring-[#D4AF37]',
  highlightOffset: 'ring-offset-[#D9C7A3] dark:ring-offset-[#0B2545]',
  priceText: 'text-[#7A1F1F] dark:text-[#D4AF37]',
  rentText: 'text-[#5C3D1E] dark:text-[#C49E42]',
  cornerDivider: 'bg-[#B8860B]/40 dark:bg-[#B8860B]/30',
  myTokenRing: 'ring-[#B8860B] dark:ring-[#D4AF37]',
  myTokenOffset: 'ring-offset-[#D9C7A3] dark:ring-offset-[#0B2545]',
  titleFont: 'font-pirate-bold font-bold text-sm sm:text-3xl tracking-wide',
  subtitleFont: 'font-naval font-normal tracking-widest',
  tileFont: 'font-sans font-extrabold tracking-tight',
  customDecoration: 'pirate',
}

// ---------------------------------------------------------------------------
// Classic (default) — UK Edition
// ---------------------------------------------------------------------------

const CLASSIC_EDITION: MonopolyThemeEdition = {
  themeId: 'default',
  editionName: 'Classic',
  editionEmoji: '🎲',
  currencySymbol: '£',
  currencyWord: 'pounds',
  spaceNames: {}, // use canonical names
  typeIcons: {}, // use default icons
  spaceLines: {}, // use default lines
  editionSubtitle: 'UK Edition',
  boardTitle: 'MONOPOLY',
  boardPalette: CLASSIC_PALETTE,
}

// ---------------------------------------------------------------------------
// Pirate edition
// ---------------------------------------------------------------------------

const PIRATE_EDITION: MonopolyThemeEdition = {
  themeId: 'pirate',
  editionName: 'Pirate',
  editionEmoji: '🏴‍☠️',
  currencySymbol: 'Đ',
  currencyWord: 'doubloons',
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
  spaceLines: {
    0: ['Port', 'Royale'],
    1: ['Tortuga'],
    2: ["Captain's", 'Log'],
    3: ['Sainte', 'Marie'],
    4: ['Harbor', 'Toll'],
    5: ["Q.A.'s", 'Revenge'],
    6: ['Santo', 'Domingo'],
    7: ["Ship's", 'Log'],
    8: ['San', 'Juan'],
    9: ['Cartagena'],
    10: ["Hangman's", 'Dock'],
    11: ['St. Lucia'],
    12: ["Ship's", 'Compass'],
    13: ['St. Kitts'],
    14: ['Kingston'],
    15: ['Whydah', 'Galley'],
    16: ['Havana'],
    17: ["Captain's", 'Log'],
    18: ['Aruba'],
    19: ['Veracruz'],
    20: ['Safe', 'Anchor'],
    21: ['Portobelo'],
    22: ["Ship's", 'Log'],
    23: ['Tobago'],
    24: ['Ocracoke', 'Inlet'],
    25: ['Royal', 'Fortune'],
    26: ['Grand', 'Bahama'],
    27: ['Bermuda'],
    28: ['Spyglass', 'Watch'],
    29: ['Barbados'],
    30: ['Marooned'],
    31: ['Cape', 'Fear'],
    32: ['Cayman', 'Islands'],
    33: ["Captain's", 'Log'],
    34: ['Grenada'],
    35: ['Adventure', 'Galley'],
    36: ["Ship's", 'Log'],
    37: ['Grand', 'Cayman'],
    38: ['Plunder', 'Tax'],
    39: ['Nassau'],
  },
  boardPalette: PIRATE_PALETTE,
}

// ---------------------------------------------------------------------------
// Registry & lookup
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Arctic edition
// ---------------------------------------------------------------------------

const ARCTIC_PALETTE: MonopolyBoardPalette = {
  boardBg:
    'bg-gradient-to-br from-[#EAF2F5] via-[#DCEBEE] to-[#CDE2E6] dark:from-[#1E4E6B] dark:via-[#15384D] dark:to-[#0A1A2A]',
  boardBorder: 'border-[#1E4E6B]/60 dark:border-[#3FA9A0]/60',
  boardShadow:
    'shadow-[0_20px_60px_rgba(30,78,107,0.25),inset_0_1px_0_rgba(255,255,255,0.8)] dark:shadow-[0_20px_60px_rgba(10,26,42,0.7),inset_0_1px_0_rgba(216,230,232,0.15)]',
  centerBg:
    'bg-gradient-to-br from-[#F4F9FA]/95 via-[#EAF2F5]/90 to-[#DFECEF]/95 dark:from-[#10263C]/95 dark:via-[#0D2034]/90 dark:to-[#0A1A2A]/95',
  centerBorder: 'border-[#1E4E6B]/30 dark:border-[#3FA9A0]/40',
  centerText: 'text-[#1B2A32] dark:text-[#D8E6E8]',
  centerSubtleText: 'text-[#5C6B73] dark:text-[#8CA3AB]',
  centerPriceText: 'text-[#1E4E6B] dark:text-[#3FA9A0]',
  centerDebtPriceText: 'text-[#B34A3C] dark:text-[#B34A3C]',
  titleColor: 'text-[#1B2A32] dark:text-[#D8E6E8]',
  subtitleColor: 'text-[#1E4E6B] dark:text-[#3FA9A0]',
  tileBg: 'bg-[#F8FBFC] dark:bg-[#10263C]/90',
  tileBorder: 'border-[#1E4E6B]/25 dark:border-[#3FA9A0]/25',
  tileText: 'text-[#1B2A32] dark:text-[#D8E6E8]',
  highlightRing: 'ring-[#1E4E6B] dark:ring-[#3FA9A0]',
  highlightOffset: 'ring-offset-[#EAF2F5] dark:ring-offset-[#0A1A2A]',
  priceText: 'text-[#1E4E6B] dark:text-[#3FA9A0]',
  rentText: 'text-[#5C6B73] dark:text-[#8CA3AB]',
  cornerDivider: 'bg-[#1E4E6B]/20 dark:bg-[#3FA9A0]/30',
  myTokenRing: 'ring-[#1E4E6B] dark:ring-[#3FA9A0]',
  myTokenOffset: 'ring-offset-[#EAF2F5] dark:ring-offset-[#0A1A2A]',
  titleFont: 'font-arctic-header font-bold text-base sm:text-3xl tracking-widest uppercase',
  subtitleFont: 'font-arctic-header font-medium tracking-widest text-xs sm:text-sm uppercase',
  tileFont: 'font-sans font-extrabold tracking-tight',
  customDecoration: 'arctic',
}

const ARCTIC_EDITION: MonopolyThemeEdition = {
  themeId: 'arctic',
  editionName: 'Arctic',
  editionEmoji: '🧭',
  currencySymbol: 'Ɨ',
  currencyWord: 'shards',
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
    // Brown: Real Winter Trails & Passes
    1: 'Klondike Trail',
    3: 'Donner Pass',
    // Light Blue: Real Northern Arctic Regions
    6: 'Svalbard',
    8: 'Lapland',
    9: 'Glacier Bay',
    // Pink: Real Glaciers & Frozen Lakes
    11: 'Lake Louise',
    13: 'Columbia Icefield',
    14: 'Hubbard Glacier',
    // Orange: Real World-Famous Ski Peaks
    16: 'Chamonix',
    18: 'Aspen',
    19: 'Whistler',
    // Red: Real Arctic Routes & Mountains
    21: 'Yukon Trail',
    23: 'Alaska Highway',
    24: 'Denali',
    // Yellow: Real Iconic Alpine Peaks
    26: 'Matterhorn',
    27: 'Mont Blanc',
    29: 'Everest Base',
    // Green: Real Polar Giants
    31: 'Ross Ice Shelf',
    32: 'K2 Mountain',
    34: 'Mount Everest',
    // Dark Blue: The Real Poles
    37: 'South Pole',
    39: 'North Pole',
    // Real Polar & Alpine Stations
    5: 'McMurdo Station',
    15: 'Zermatt Station',
    25: 'Summit Station',
    35: 'Vostok Station',
    // Utilities
    12: 'Northern Lights',
    28: 'Hot Springs',
    // Community Chest & Chance
    2: 'Supply Cache',
    17: 'Supply Cache',
    33: 'Supply Cache',
    7: 'Polar Compass',
    22: 'Polar Compass',
    36: 'Polar Compass',
    // Corners & Specials
    0: 'Base Camp',
    4: 'Ice Toll',
    10: 'Shelter Camp',
    20: 'Winter Feast',
    30: 'Snow Storm',
    38: 'Khumbu Icefall',
  },
  spaceLines: {
    0: ['BASE', 'CAMP'],
    1: ['KLONDIKE', 'TRAIL'],
    2: ['SUPPLY', 'CACHE'],
    3: ['DONNER', 'PASS'],
    4: ['ICE', 'TOLL'],
    5: ['MCMURDO', 'STATION'],
    6: ['SVALBARD'],
    7: ['POLAR', 'COMPASS'],
    8: ['LAPLAND'],
    9: ['GLACIER', 'BAY'],
    10: ['SHELTER', 'CAMP'],
    11: ['LAKE', 'LOUISE'],
    12: ['NORTHERN', 'LIGHTS'],
    13: ['COLUMBIA', 'ICEFIELD'],
    14: ['HUBBARD', 'GLACIER'],
    15: ['ZERMATT', 'STATION'],
    16: ['CHAMONIX'],
    17: ['SUPPLY', 'CACHE'],
    18: ['ASPEN'],
    19: ['WHISTLER'],
    20: ['WINTER', 'FEAST'],
    21: ['YUKON', 'TRAIL'],
    22: ['POLAR', 'COMPASS'],
    23: ['ALASKA', 'HIGHWAY'],
    24: ['DENALI'],
    25: ['SUMMIT', 'STATION'],
    26: ['THE', 'MATTERHORN'],
    27: ['MONT', 'BLANC'],
    28: ['HOT', 'SPRINGS'],
    29: ['EVEREST', 'BASE'],
    30: ['SNOW', 'STORM'],
    31: ['ROSS ICE', 'SHELF'],
    32: ['K2', 'MOUNTAIN'],
    33: ['SUPPLY', 'CACHE'],
    34: ['MOUNT', 'EVEREST'],
    35: ['VOSTOK', 'STATION'],
    36: ['POLAR', 'COMPASS'],
    37: ['SOUTH', 'POLE'],
    38: ['KHUMBU', 'ICEFALL'],
    39: ['NORTH', 'POLE'],
  },
  boardPalette: ARCTIC_PALETTE,
}

const NAIJA_PALETTE: MonopolyBoardPalette = {
  boardBg:
    'bg-gradient-to-br from-[#F4EDE1] via-[#EAE1D3] to-[#DED3C3] dark:from-[#0B1F16] dark:via-[#091811] dark:to-[#06110C]',
  boardBorder: 'border-[#008751]/80 dark:border-[#D9A441]/80',
  boardShadow:
    'shadow-[0_20px_60px_rgba(26,31,28,0.3),inset_0_1px_0_rgba(255,255,255,0.5)] dark:shadow-[0_20px_60px_rgba(3,11,7,0.85),inset_0_1px_0_rgba(217,164,65,0.25)]',
  centerBg:
    'bg-gradient-to-br from-[#F4EDE1]/95 via-[#EAE1D3]/90 to-[#DED3C3]/95 dark:from-[#0E261B]/95 dark:via-[#0B1F16]/90 dark:to-[#07150F]/95',
  centerBorder: 'border-[#008751]/50 dark:border-[#D9A441]/40',
  centerText: 'text-[#1A1F1C] dark:text-[#EDE3D3]',
  centerSubtleText: 'text-[#008751] dark:text-[#D9A441]/85',
  centerPriceText: 'text-[#008751] dark:text-[#D9A441]',
  centerDebtPriceText: 'text-[#B5622A] dark:text-[#9C3B2E]',
  titleColor: 'text-[#008751] dark:text-[#D9A441]',
  subtitleColor: 'text-[#B5622A] dark:text-[#EDE3D3]/80',
  tileBg: 'bg-[#F9F5EE] dark:bg-[#0E261B]',
  tileBorder: 'border-[#008751]/40 dark:border-[#D9A441]/35',
  tileText: 'text-[#1A1F1C] dark:text-[#EDE3D3]',
  highlightRing: 'ring-[#008751] dark:ring-[#D9A441]',
  highlightOffset: 'ring-offset-[#EAE1D3] dark:ring-offset-[#0B1F16]',
  priceText: 'text-[#008751] dark:text-[#D9A441]',
  rentText: 'text-[#B5622A] dark:text-[#EDE3D3]/80',
  cornerDivider: 'bg-[#008751]/30 dark:bg-[#D9A441]/30',
  myTokenRing: 'ring-[#008751] dark:ring-[#D9A441]',
  myTokenOffset: 'ring-offset-[#EAE1D3] dark:ring-offset-[#0B1F16]',
  titleFont: 'font-sans font-black text-sm sm:text-3xl tracking-wide',
  subtitleFont: 'font-sans font-semibold tracking-wider text-xs sm:text-sm uppercase',
  tileFont: 'font-sans font-bold tracking-tight',
  customDecoration: 'naija',
}

const NAIJA_EDITION: MonopolyThemeEdition = {
  themeId: 'naija',
  editionName: 'Naija',
  editionEmoji: '🇳🇬',
  currencySymbol: '₦',
  currencyWord: 'naira',
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
    0: 'Balogun Market',
    1: 'Oshodi Market',
    2: 'Esusu Fund',
    3: 'Yaba Market',
    4: 'LGA Market Levy',
    5: 'Iddo Railway Terminal',
    6: 'Ariaria Market',
    7: 'Trade Venture',
    8: 'Main Market Onitsha',
    9: 'Alaba International',
    10: 'Kirikiri',
    11: 'Tejuosho Market',
    12: 'NEPA / PHCN',
    13: 'Ogbete Market',
    14: 'Kurmi Market',
    15: 'Abuja Metro Station',
    16: 'Mile 12 Market',
    17: 'Market Guild',
    18: 'Garki Model Market',
    19: 'Computer Village',
    20: 'Obalende Park',
    21: 'Bodija Market',
    22: 'Trade Venture',
    23: 'Wuse Market',
    24: 'Idumota Market',
    25: 'Port Harcourt Terminus',
    26: 'Dugbe Market',
    27: 'Aba Mills',
    28: 'Water Board',
    29: 'Tin Can Island',
    30: 'Taskforce Arrest',
    31: 'Allen Avenue',
    32: 'Adetokunbo Ademola',
    33: 'Esusu Fund',
    34: 'Ahmadu Bello Way',
    35: 'Rigasa Station',
    36: 'Trade Venture',
    37: 'Wuse II',
    38: 'FIRS Luxury Tax',
    39: 'Bourdillon Road',
  },
  spaceLines: {
    0: ['BALOGUN', 'MARKET'],
    1: ['OSHODI', 'MARKET'],
    2: ['ESUSU', 'FUND'],
    3: ['YABA', 'MARKET'],
    4: ['MARKET', 'LEVY'],
    5: ['IDDO', 'TERMINAL'],
    6: ['ARIARIA', 'MARKET'],
    7: ['TRADE', 'VENTURE'],
    8: ['MAIN MKT', 'ONITSHA'],
    9: ['ALABA', 'INTL'],
    10: ['KIRIKIRI', 'PRISON'],
    11: ['TEJUOSHO', 'MARKET'],
    12: ['NEPA /', 'PHCN'],
    13: ['OGBETE', 'MARKET'],
    14: ['KURMI', 'MARKET'],
    15: ['ABUJA', 'METRO'],
    16: ['MILE 12', 'MARKET'],
    17: ['MARKET', 'GUILD'],
    18: ['GARKI', 'MODEL'],
    19: ['COMPUTER', 'VILLAGE'],
    20: ['OBALENDE', 'PARK'],
    21: ['BODIJA', 'MARKET'],
    22: ['TRADE', 'VENTURE'],
    23: ['WUSE', 'MARKET'],
    24: ['IDUMOTA', 'MARKET'],
    25: ['PH', 'TERMINUS'],
    26: ['DUGBE', 'MARKET'],
    27: ['ABA', 'MILLS'],
    28: ['WATER', 'BOARD'],
    29: ['TIN CAN', 'ISLAND'],
    30: ['TASKFORCE', 'ARREST'],
    31: ['ALLEN', 'AVENUE'],
    32: ['ADETOKUNBO', 'ADEMOLA'],
    33: ['ESUSU', 'FUND'],
    34: ['AHMADU', 'BELLO WAY'],
    35: ['RIGASA', 'STATION'],
    36: ['TRADE', 'VENTURE'],
    37: ['WUSE', 'II'],
    38: ['LUXURY', 'TAX'],
    39: ['BOURDILLON', 'ROAD'],
  },
  boardPalette: NAIJA_PALETTE,
}

/** All Monopoly theme editions, in picker display order. */
export const MONOPOLY_EDITIONS: MonopolyThemeEdition[] = [
  CLASSIC_EDITION,
  PIRATE_EDITION,
  ARCTIC_EDITION,
  NAIJA_EDITION,
]

const EDITION_MAP: Record<string, MonopolyThemeEdition> = Object.fromEntries(
  MONOPOLY_EDITIONS.map((e) => [e.themeId, e])
)

/** Get the Monopoly edition for a given theme ID (defaults to Classic). */
export function getMonopolyEdition(themeId?: string | null): MonopolyThemeEdition {
  if (!themeId) return CLASSIC_EDITION
  return EDITION_MAP[themeId] ?? CLASSIC_EDITION
}

// ---------------------------------------------------------------------------
// Themed helpers
// ---------------------------------------------------------------------------

/** Get the themed display name for a space, falling back to canonical name. */
export function themedSpaceName(canonicalName: string, spaceIndex: number, themeId?: string | null): string {
  const edition = getMonopolyEdition(themeId)
  return edition.spaceNames[spaceIndex] ?? canonicalName
}

/** Get the themed two-line board tile label for a space. Returns null if no override exists. */
export function themedSpaceLines(
  canonicalName: string,
  spaceType: MonopolySpaceType,
  spaceIndex: number,
  themeId?: string | null
): string[] | null {
  const edition = getMonopolyEdition(themeId)
  return edition.spaceLines[spaceIndex] ?? null // null means "use default boardSpaceLines logic"
}

/** Get the themed icon for a space type. */
export function themedSpaceIcon(spaceType: MonopolySpaceType, themeId?: string | null): string {
  const edition = getMonopolyEdition(themeId)
  return edition.typeIcons[spaceType] ?? ''
}

/** Get the numerical multiplier for currency in the current theme (e.g. 1000 for Naija Edition). */
export function getMoneyScale(themeId?: string | null): number {
  const edition = getMonopolyEdition(themeId)
  return edition.themeId === 'naija' ? 1000 : 1
}

/** Convert a canonical game money amount (e.g. 10) to its displayed numerical value (e.g. 10000). */
export function canonicalToDisplayMoney(canonicalAmount: number, themeId?: string | null): number {
  return canonicalAmount * getMoneyScale(themeId)
}

/** Convert a user-entered numerical display value (e.g. 10000) to canonical game money (e.g. 10). */
export function displayToCanonicalMoney(displayAmount: number, themeId?: string | null): number {
  return Math.round(displayAmount / getMoneyScale(themeId))
}

/** Format a money amount with the themed currency symbol. */
export function formatThemedMoney(amount: number, themeId?: string | null): string {
  const edition = getMonopolyEdition(themeId)
  const displayVal = canonicalToDisplayMoney(amount, themeId)
  return `${edition.currencySymbol}${displayVal.toLocaleString('en-GB')}`
}

/** Get the board visual palette for a theme. */
export function getBoardPalette(themeId?: string | null): MonopolyBoardPalette {
  return getMonopolyEdition(themeId).boardPalette
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Translate canonical UK space names and £ currency in any text string to the active theme. */
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

  if (edition.themeId === 'naija') {
    formatted = formatted.replace(/£(\d+(?:,\d+)*(?:\.\d+)?)/g, (_, numStr) => {
      const num = parseFloat(numStr.replace(/,/g, ''))
      return `${edition.currencySymbol}${(num * 1000).toLocaleString('en-GB')}`
    })
  } else {
    formatted = formatted.replace(/£(\d+(?:,\d+)*(?:\.\d+)?)/g, `${edition.currencySymbol}$1`)
  }
  formatted = formatted.replace(/£/g, edition.currencySymbol)
  if (edition.currencyWord && edition.currencyWord !== 'pounds') {
    formatted = formatted.replace(/\bpounds\b/g, edition.currencyWord)
    formatted = formatted.replace(/\bPounds\b/g, edition.currencyWord[0].toUpperCase() + edition.currencyWord.slice(1))
    formatted = formatted.replace(/\bPOUNDS\b/g, edition.currencyWord.toUpperCase())
  }

  return formatted
}
