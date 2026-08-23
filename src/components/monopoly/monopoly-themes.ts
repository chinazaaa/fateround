import type { ThemeId } from '@/types'
import {
  MONOPOLY_BOARD,
  MONOPOLY_EXPANDED_BOARD,
  type MonopolySpaceType,
  type MonopolyBoardSize,
} from '@/lib/monopoly-board'

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
  /** Themed display names keyed by space index (0–39) for 40-space board. Missing = use canonical. */
  spaceNames: Partial<Record<number, string>>
  /** Edition-specific names for all spaces on the 48-space board (0–47). */
  expandedSpaceNames: Partial<Record<number, string>>
  /** Themed icons keyed by space *type*. Missing = use default icon. */
  typeIcons: Partial<Record<MonopolySpaceType, string>>
  /** Themed two-line labels for 40-space board grid, keyed by space index (0–39). */
  spaceLines: Partial<Record<number, string[]>>
  /** Themed two-line labels for 48-space board grid, keyed by space index (0–47). */
  expandedSpaceLines?: Partial<Record<number, string[]>>
  /** Edition subtitle shown in the board center (e.g. "London Edition", "Pirate Edition"). */
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
  boardBg: 'bg-gradient-to-br from-slate-800 via-slate-900 to-neutral-950',
  boardBorder: 'border-rose-500/70',
  boardShadow: 'shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.10)]',
  centerBg: 'bg-gradient-to-br from-slate-700/90 to-slate-950/95',
  centerBorder: 'border-slate-600/40',
  centerText: 'text-white',
  centerSubtleText: 'text-slate-200/80',
  centerPriceText: 'text-violet-300',
  centerDebtPriceText: 'text-rose-300',
  titleColor: 'text-rose-300',
  subtitleColor: 'text-violet-200/70',
  tileBg: 'bg-[#faf8f2]',
  tileBorder: 'border-neutral-300/80',
  tileText: 'text-neutral-800',
  highlightRing: 'ring-rose-400',
  highlightOffset: 'ring-offset-slate-900',
  priceText: 'text-neutral-500',
  rentText: 'text-slate-800',
  cornerDivider: 'bg-neutral-200',
  myTokenRing: 'ring-violet-300',
  myTokenOffset: 'ring-offset-slate-900',
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
// Classic (default) — London Edition
// ---------------------------------------------------------------------------

const CLASSIC_EDITION: MonopolyThemeEdition = {
  themeId: 'default',
  editionName: 'Classic',
  editionEmoji: '🎲',
  currencySymbol: '£',
  currencyWord: 'pounds',
  spaceNames: {}, // use canonical names
  expandedSpaceNames: {
    0: 'PAYDAY',
    1: 'Barking Road',
    2: 'Fate',
    3: 'Dagenham Ave',
    4: 'Thamesmead Walk',
    5: 'Croydon High',
    6: 'Paddington',
    7: 'Erith Road',
    8: 'Canary Wharf',
    9: 'Esusu Fund',
    10: 'Bermondsey',
    11: 'Limehouse',
    12: 'NICKED',
    13: 'Walthamstow',
    14: 'Market Shock',
    15: 'Peckham Rye',
    16: 'Deptford Way',
    17: 'Hampstead',
    18: 'Waterloo',
    19: 'Islington',
    20: 'Ilford Lane',
    21: 'Water Board',
    22: 'Romford Road',
    23: 'Enfield Town',
    24: 'LAY-BY',
    25: 'Stratford Cross',
    26: 'Community Grant',
    27: 'Hackney Wick',
    28: 'Brixton Hill',
    29: 'Shoreditch',
    30: 'Victoria',
    31: 'Kings Cross',
    32: 'Clapham Common',
    33: 'Power Company',
    34: 'Fulham Broadway',
    35: 'Battersea Rise',
    36: 'OFF TO NICKED',
    37: 'Marylebone Lane',
    38: 'Kitty',
    39: 'Notting Hill',
    40: 'South Kensington',
    41: 'Chester Square',
    42: 'London Bridge',
    43: 'Winnington Road',
    44: 'Kensington Mews',
    45: 'Luxury Tax',
    46: 'Regent Street',
    47: 'Mayfair Mews',
  },
  typeIcons: {}, // use default icons
  spaceLines: {}, // use default lines
  expandedSpaceLines: {
    0: ['PAYDAY', '→'],
    1: ['Barking', 'Road'],
    2: ['Fate', '?'],
    3: ['Dagenham', 'Ave'],
    4: ['Thamesmead', 'Walk'],
    5: ['Croydon', 'High'],
    6: ['Paddington', 'Station'],
    7: ['Erith', 'Road'],
    8: ['Canary', 'Wharf'],
    9: ['Esusu', 'Fund'],
    10: ['Bermondsey'],
    11: ['Limehouse'],
    12: ['NICKED', '🔒'],
    13: ['Walthamstow'],
    14: ['Market', 'Shock'],
    15: ['Peckham', 'Rye'],
    16: ['Deptford', 'Way'],
    17: ['Hampstead'],
    18: ['Waterloo', 'Station'],
    19: ['Islington'],
    20: ['Ilford', 'Lane'],
    21: ['Water', 'Board'],
    22: ['Romford', 'Road'],
    23: ['Enfield', 'Town'],
    24: ['LAY-BY', '🅿️'],
    25: ['Stratford', 'Cross'],
    26: ['Community', 'Grant'],
    27: ['Hackney', 'Wick'],
    28: ['Brixton', 'Hill'],
    29: ['Shoreditch'],
    30: ['Victoria', 'Station'],
    31: ['Kings', 'Cross'],
    32: ['Clapham', 'Common'],
    33: ['Power', 'Company'],
    34: ['Fulham', 'Broadway'],
    35: ['Battersea', 'Rise'],
    36: ['OFF TO', 'NICKED'],
    37: ['Marylebone', 'Lane'],
    38: ['Kitty'],
    39: ['Notting', 'Hill'],
    40: ['South', 'Kensington'],
    41: ['Chester', 'Square'],
    42: ['London', 'Bridge'],
    43: ['Winnington', 'Road'],
    44: ['Kensington', 'Mews'],
    45: ['Luxury', 'Tax'],
    46: ['Regent', 'Street'],
    47: ['Mayfair', 'Mews'],
  },
  editionSubtitle: 'London Edition',
  boardTitle: 'ESTATE KINGS',
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
  expandedSpaceNames: {
    0: 'Port Royale',
    1: 'Tortuga',
    2: "Ship's Log",
    3: 'Sainte-Marie',
    4: 'Santo Domingo',
    5: 'San Juan',
    6: "Q.A.'s Revenge",
    7: 'Cartagena',
    8: 'Corsair Port',
    9: "Crew's Bounty",
    10: 'Skull Island',
    11: 'Cutlass Cove',
    12: "Hangman's Dock",
    13: 'Havana',
    14: 'Trade Winds',
    15: 'Aruba',
    16: 'Veracruz',
    17: 'Emerald Shoal',
    18: 'Whydah Galley',
    19: 'Kraken Reef',
    20: 'St. Lucia',
    21: 'Spyglass Watch',
    22: 'St. Kitts',
    23: 'Kingston',
    24: 'Safe Anchor',
    25: 'Portobelo',
    26: 'Fleet Bounty',
    27: 'Tobago',
    28: 'Ocracoke Inlet',
    29: 'Black Gull',
    30: 'Royal Fortune',
    31: 'Dead Man Bay',
    32: 'Grand Bahama',
    33: "Ship's Compass",
    34: 'Bermuda',
    35: 'Barbados',
    36: 'Marooned',
    37: 'Cape Fear',
    38: "Captain's Log",
    39: 'Cayman Islands',
    40: 'Grenada',
    41: 'Grand Cayman',
    42: 'Adventure Galley',
    43: 'Nassau',
    44: 'Buccaneer Bay',
    45: 'Plunder Tax',
    46: 'Royal Strait',
    47: 'Golden Cove',
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
  expandedSpaceLines: {
    0: ['Port', 'Royale'],
    1: ['Tortuga'],
    2: ["Ship's", 'Log'],
    3: ['Sainte', 'Marie'],
    4: ['Santo', 'Domingo'],
    5: ['San', 'Juan'],
    6: ["Q.A.'s", 'Revenge'],
    7: ['Cartagena'],
    8: ['Corsair', 'Port'],
    9: ["Crew's", 'Bounty'],
    10: ['Skull', 'Island'],
    11: ['Cutlass', 'Cove'],
    12: ["Hangman's", 'Dock'],
    13: ['Havana'],
    14: ['Trade', 'Winds'],
    15: ['Aruba'],
    16: ['Veracruz'],
    17: ['Emerald', 'Shoal'],
    18: ['Whydah', 'Galley'],
    19: ['Kraken', 'Reef'],
    20: ['St.', 'Lucia'],
    21: ['Spyglass', 'Watch'],
    22: ['St.', 'Kitts'],
    23: ['Kingston'],
    24: ['Safe', 'Anchor'],
    25: ['Portobelo'],
    26: ['Fleet', 'Bounty'],
    27: ['Tobago'],
    28: ['Ocracoke', 'Inlet'],
    29: ['Black', 'Gull'],
    30: ['Royal', 'Fortune'],
    31: ['Dead Man', 'Bay'],
    32: ['Grand', 'Bahama'],
    33: ["Ship's", 'Compass'],
    34: ['Bermuda'],
    35: ['Barbados'],
    36: ['Marooned'],
    37: ['Cape', 'Fear'],
    38: ["Captain's", 'Log'],
    39: ['Cayman', 'Islands'],
    40: ['Grenada'],
    41: ['Grand', 'Cayman'],
    42: ['Adventure', 'Galley'],
    43: ['Nassau'],
    44: ['Buccaneer', 'Bay'],
    45: ['Plunder', 'Tax'],
    46: ['Royal', 'Strait'],
    47: ['Golden', 'Cove'],
  },
  boardPalette: PIRATE_PALETTE,
}

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
    1: 'Klondike Trail',
    3: 'Donner Pass',
    6: 'Svalbard',
    8: 'Lapland',
    9: 'Glacier Bay',
    11: 'Lake Louise',
    13: 'Columbia Icefield',
    14: 'Hubbard Glacier',
    16: 'Chamonix',
    18: 'Aspen',
    19: 'Whistler',
    21: 'Yukon Trail',
    23: 'Alaska Highway',
    24: 'Denali',
    26: 'Matterhorn',
    27: 'Mont Blanc',
    29: 'Everest Base',
    31: 'Ross Ice Shelf',
    32: 'K2 Mountain',
    34: 'Mount Everest',
    37: 'South Pole',
    39: 'North Pole',
    5: 'McMurdo Station',
    15: 'Zermatt Station',
    25: 'Summit Station',
    35: 'Vostok Station',
    12: 'Northern Lights',
    28: 'Hot Springs',
    2: 'Supply Cache',
    17: 'Supply Cache',
    33: 'Supply Cache',
    7: 'Polar Compass',
    22: 'Polar Compass',
    36: 'Polar Compass',
    0: 'Base Camp',
    4: 'Ice Toll',
    10: 'Shelter Camp',
    20: 'Winter Feast',
    30: 'Snow Storm',
    38: 'Khumbu Icefall',
  },
  expandedSpaceNames: {
    0: 'Base Camp',
    1: 'Klondike Trail',
    2: 'Polar Compass',
    3: 'Donner Pass',
    4: 'Svalbard',
    5: 'Lapland',
    6: 'McMurdo Station',
    7: 'Glacier Bay',
    8: 'Frost Harbour',
    9: 'Supply Cache',
    10: 'Frost Valley',
    11: 'Arctic Circle',
    12: 'Shelter Camp',
    13: 'Chamonix',
    14: 'Whiteout',
    15: 'Aspen',
    16: 'Whistler',
    17: 'Icefall Pass',
    18: 'Zermatt Station',
    19: 'Polar Plateau',
    20: 'Lake Louise',
    21: 'Hot Springs',
    22: 'Columbia Icefield',
    23: 'Hubbard Glacier',
    24: 'Winter Feast',
    25: 'Yukon Trail',
    26: 'Relief Cache',
    27: 'Alaska Highway',
    28: 'Denali',
    29: 'Aurora Point',
    30: 'Summit Station',
    31: 'Glacier Peak',
    32: 'Matterhorn',
    33: 'Northern Lights',
    34: 'Mont Blanc',
    35: 'Everest Base',
    36: 'Snow Storm',
    37: 'Ross Ice Shelf',
    38: 'Supply Cache',
    39: 'K2 Mountain',
    40: 'Mount Everest',
    41: 'South Pole',
    42: 'Vostok Station',
    43: 'North Pole',
    44: 'Nunavut Ridge',
    45: 'Khumbu Icefall',
    46: 'Greenland Shelf',
    47: 'Arctic Coast',
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
  expandedSpaceLines: {
    0: ['BASE', 'CAMP'],
    1: ['KLONDIKE', 'TRAIL'],
    2: ['POLAR', 'COMPASS'],
    3: ['DONNER', 'PASS'],
    4: ['SVALBARD'],
    5: ['LAPLAND'],
    6: ['MCMURDO', 'STATION'],
    7: ['GLACIER', 'BAY'],
    8: ['FROST', 'HARBOUR'],
    9: ['SUPPLY', 'CACHE'],
    10: ['FROST', 'VALLEY'],
    11: ['ARCTIC', 'CIRCLE'],
    12: ['SHELTER', 'CAMP'],
    13: ['CHAMONIX'],
    14: ['WHITEOUT'],
    15: ['ASPEN'],
    16: ['WHISTLER'],
    17: ['ICEFALL', 'PASS'],
    18: ['ZERMATT', 'STATION'],
    19: ['POLAR', 'PLATEAU'],
    20: ['LAKE', 'LOUISE'],
    21: ['HOT', 'SPRINGS'],
    22: ['COLUMBIA', 'ICEFIELD'],
    23: ['HUBBARD', 'GLACIER'],
    24: ['WINTER', 'FEAST'],
    25: ['YUKON', 'TRAIL'],
    26: ['RELIEF', 'CACHE'],
    27: ['ALASKA', 'HIGHWAY'],
    28: ['DENALI'],
    29: ['AURORA', 'POINT'],
    30: ['SUMMIT', 'STATION'],
    31: ['GLACIER', 'PEAK'],
    32: ['MATTERHORN'],
    33: ['NORTHERN', 'LIGHTS'],
    34: ['MONT', 'BLANC'],
    35: ['EVEREST', 'BASE'],
    36: ['SNOW', 'STORM'],
    37: ['ROSS ICE', 'SHELF'],
    38: ['SUPPLY', 'CACHE'],
    39: ['K2', 'MOUNTAIN'],
    40: ['MOUNT', 'EVEREST'],
    41: ['SOUTH', 'POLE'],
    42: ['VOSTOK', 'STATION'],
    43: ['NORTH', 'POLE'],
    44: ['NUNAVUT', 'RIDGE'],
    45: ['KHUMBU', 'ICEFALL'],
    46: ['GREENLAND', 'SHELF'],
    47: ['ARCTIC', 'COAST'],
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
    0: 'Oshodi Bus Terminal',
    1: 'Oshodi Market',
    2: 'Esusu Fund',
    3: 'Sabon Gari',
    4: 'LGA Market Levy',
    5: 'Iddo Terminal',
    6: 'Ariaria Market',
    7: 'Trade Venture',
    8: 'Niger Bridge',
    9: 'Ogbunike Caves',
    10: 'Kirikiri',
    11: 'Yankari Reserve',
    12: 'NEPA / PHCN',
    13: 'Ogbete Market',
    14: 'Kurmi Market',
    15: 'Abuja Metro',
    16: 'Mile 12 Market',
    17: 'Market Guild',
    18: 'Millennium Park',
    19: 'Trans Ekulu',
    20: 'Obalende Park',
    21: 'Bodija Market',
    22: 'Trade Venture',
    23: 'Omu Resort',
    24: 'Osogbo Grove',
    25: 'PH Terminus',
    26: 'Cocoa House',
    27: 'Aba Mills',
    28: 'Water Board',
    29: 'Tin Can Island',
    30: 'Taskforce Arrest',
    31: 'Allen Avenue',
    32: 'Ikogosi Resort',
    33: 'Esusu Fund',
    34: 'Ahmadu Bello Way',
    35: 'Aba Terminal',
    36: 'Trade Venture',
    37: 'Wuse II',
    38: 'FIRS Luxury Tax',
    39: 'Eko Hotels',
  },
  expandedSpaceNames: {
    0: 'Oshodi Bus Terminal',
    1: 'Oshodi Market',
    2: 'Trade Venture',
    3: 'Sabon Gari',
    4: 'Ariaria Market',
    5: 'Niger Bridge',
    6: 'Iddo Terminal',
    7: 'Ogbunike Caves',
    8: 'Apapa Wharf',
    9: 'Esusu Fund',
    10: 'Wuse Market',
    11: 'Akowonjo',
    12: 'Kirikiri',
    13: 'Mile 12 Market',
    14: 'Trade Venture',
    15: 'Millennium Park',
    16: 'Trans Ekulu',
    17: 'Freedom Park',
    18: 'Abuja Metro',
    19: 'Jabi Lake',
    20: 'Yankari Reserve',
    21: 'Water Board',
    22: 'Ogbete Market',
    23: 'Kurmi Market',
    24: 'Obalende Park',
    25: 'Bodija Market',
    26: 'Esusu Fund',
    27: 'Omu Resort',
    28: 'Osogbo Grove',
    29: 'Marina Road',
    30: 'PH Terminus',
    31: 'Ikeja GRA',
    32: 'Cocoa House',
    33: 'NEPA / PHCN',
    34: 'Aba Mills',
    35: 'Tin Can Island',
    36: 'Taskforce Arrest',
    37: 'Allen Avenue',
    38: 'Esusu Fund',
    39: 'Ikogosi Resort',
    40: 'Ahmadu Bello Way',
    41: 'Wuse II',
    42: 'Aba Terminal',
    43: 'Eko Hotels',
    44: 'Maitama',
    45: 'FIRS Luxury Tax',
    46: 'Victoria Island',
    47: 'Banana Island',
  },
  spaceLines: {
    0: ['OSHODI BUS', 'TERMINAL'],
    1: ['OSHODI', 'MARKET'],
    2: ['ESUSU', 'FUND'],
    3: ['SABON', 'GARI'],
    4: ['MARKET', 'LEVY'],
    5: ['IDDO', 'TERMINAL'],
    6: ['ARIARIA', 'MARKET'],
    7: ['TRADE', 'VENTURE'],
    8: ['NIGER', 'BRIDGE'],
    9: ['OGBUNIKE', 'CAVES'],
    10: ['KIRIKIRI', '🔒'],
    11: ['YANKARI', 'RESERVE'],
    12: ['NEPA /', 'PHCN'],
    13: ['OGBETE', 'MARKET'],
    14: ['KURMI', 'MARKET'],
    15: ['ABUJA', 'METRO'],
    16: ['MILE 12', 'MARKET'],
    17: ['MARKET', 'GUILD'],
    18: ['MILLENNIUM', 'PARK'],
    19: ['TRANS', 'EKULU'],
    20: ['OBALENDE', 'PARK'],
    21: ['BODIJA', 'MARKET'],
    22: ['TRADE', 'VENTURE'],
    23: ['OMU', 'RESORT'],
    24: ['OSOGBO', 'GROVE'],
    25: ['PH', 'TERMINUS'],
    26: ['COCOA', 'HOUSE'],
    27: ['ABA', 'MILLS'],
    28: ['WATER', 'BOARD'],
    29: ['TIN CAN', 'ISLAND'],
    30: ['TASKFORCE', 'ARREST'],
    31: ['ALLEN', 'AVENUE'],
    32: ['IKOGOSI', 'RESORT'],
    33: ['ESUSU', 'FUND'],
    34: ['AHMADU', 'BELLO WAY'],
    35: ['ABA BUS', 'TERMINAL'],
    36: ['TRADE', 'VENTURE'],
    37: ['WUSE II'],
    38: ['FIRS LUXURY', 'TAX'],
    39: ['EKO', 'HOTELS'],
  },
  expandedSpaceLines: {
    0: ['OSHODI BUS', 'TERMINAL'],
    1: ['OSHODI', 'MARKET'],
    2: ['TRADE', 'VENTURE'],
    3: ['SABON', 'GARI'],
    4: ['ARIARIA', 'MARKET'],
    5: ['NIGER', 'BRIDGE'],
    6: ['IDDO', 'TERMINAL'],
    7: ['OGBUNIKE', 'CAVES'],
    8: ['APAPA', 'WHARF'],
    9: ['ESUSU', 'FUND'],
    10: ['WUSE', 'MARKET'],
    11: ['AKOWONJO'],
    12: ['KIRIKIRI', '🔒'],
    13: ['MILE 12', 'MARKET'],
    14: ['TRADE', 'VENTURE'],
    15: ['MILLENNIUM', 'PARK'],
    16: ['TRANS', 'EKULU'],
    17: ['FREEDOM', 'PARK'],
    18: ['ABUJA', 'METRO'],
    19: ['JABI', 'LAKE'],
    20: ['YANKARI', 'RESERVE'],
    21: ['WATER', 'BOARD'],
    22: ['OGBETE', 'MARKET'],
    23: ['KURMI', 'MARKET'],
    24: ['OBALENDE', 'PARK'],
    25: ['BODIJA', 'MARKET'],
    26: ['ESUSU', 'FUND'],
    27: ['OMU', 'RESORT'],
    28: ['OSOGBO', 'GROVE'],
    29: ['MARINA', 'ROAD'],
    30: ['PH', 'TERMINUS'],
    31: ['IKEJA', 'GRA'],
    32: ['COCOA', 'HOUSE'],
    33: ['NEPA /', 'PHCN'],
    34: ['ABA', 'MILLS'],
    35: ['TIN CAN', 'ISLAND'],
    36: ['TASKFORCE', 'ARREST'],
    37: ['ALLEN', 'AVENUE'],
    38: ['ESUSU', 'FUND'],
    39: ['IKOGOSI', 'RESORT'],
    40: ['AHMADU', 'BELLO WAY'],
    41: ['WUSE II'],
    42: ['ABA BUS', 'TERMINAL'],
    43: ['EKO', 'HOTELS'],
    44: ['MAITAMA'],
    45: ['FIRS LUXURY', 'TAX'],
    46: ['VICTORIA', 'ISLAND'],
    47: ['BANANA', 'ISLAND'],
  },
  boardPalette: NAIJA_PALETTE,
}

// ---------------------------------------------------------------------------
// USA edition — first paid drop (docs/estate-kings-america-edition.md).
// Property/street names, station terminals, utilities, and corner labels
// come verbatim from the spec so trademark review has one source of truth.
// ---------------------------------------------------------------------------

const AMERICA_PALETTE: MonopolyBoardPalette = {
  boardBg:
    'bg-gradient-to-br from-[#F4ECD8] via-[#E8DBB5] to-[#D9C58A] dark:from-[#0F1A38] dark:via-[#0A1330] dark:to-[#050A1E]',
  boardBorder: 'border-[#8B1A1A]/70 dark:border-[#C9A44C]/70',
  boardShadow:
    'shadow-[0_20px_60px_rgba(20,28,60,0.28),inset_0_1px_0_rgba(255,255,255,0.55)] dark:shadow-[0_20px_60px_rgba(4,8,20,0.85),inset_0_1px_0_rgba(201,164,76,0.22)]',
  centerBg:
    'bg-gradient-to-br from-[#F7F0DD]/95 via-[#EDE0B6]/90 to-[#DDCB93]/95 dark:from-[#132348]/95 dark:via-[#0D1A3A]/90 dark:to-[#08122A]/95',
  centerBorder: 'border-[#8B1A1A]/45 dark:border-[#C9A44C]/35',
  centerText: 'text-[#1B2340] dark:text-[#F4ECD8]',
  centerSubtleText: 'text-[#8B1A1A]/85 dark:text-[#C9A44C]/85',
  centerPriceText: 'text-[#1E3A5F] dark:text-[#C9A44C]',
  centerDebtPriceText: 'text-[#8B1A1A] dark:text-[#F4A4A4]',
  titleColor: 'text-[#1E3A5F] dark:text-[#C9A44C]',
  subtitleColor: 'text-[#8B1A1A] dark:text-[#F4ECD8]/80',
  tileBg: 'bg-[#FBF6E6] dark:bg-[#132348]',
  tileBorder: 'border-[#8B1A1A]/40 dark:border-[#C9A44C]/30',
  tileText: 'text-[#1B2340] dark:text-[#F4ECD8]',
  highlightRing: 'ring-[#8B1A1A] dark:ring-[#C9A44C]',
  highlightOffset: 'ring-offset-[#E8DBB5] dark:ring-offset-[#0F1A38]',
  priceText: 'text-[#1E3A5F] dark:text-[#C9A44C]',
  rentText: 'text-[#8B1A1A] dark:text-[#F4ECD8]/80',
  cornerDivider: 'bg-[#8B1A1A]/30 dark:bg-[#C9A44C]/30',
  myTokenRing: 'ring-[#1E3A5F] dark:ring-[#C9A44C]',
  myTokenOffset: 'ring-offset-[#E8DBB5] dark:ring-offset-[#0F1A38]',
  titleFont: 'font-sans font-black text-sm sm:text-3xl tracking-wide',
  subtitleFont: 'font-sans font-semibold tracking-widest text-xs sm:text-sm uppercase',
  tileFont: 'font-sans font-bold tracking-tight',
  customDecoration: 'none',
}

const AMERICA_EDITION: MonopolyThemeEdition = {
  themeId: 'america',
  editionName: 'USA',
  editionEmoji: '⭐',
  currencySymbol: '$',
  currencyWord: 'dollars',
  editionSubtitle: 'USA Edition',
  boardTitle: 'ESTATE KINGS',
  typeIcons: {
    go: '💵',
    chance: '❓',
    community: '🏛️',
    tax: '🧾',
    jail: '🚔',
    go_to_jail: '🚓',
    free_parking: '🛻',
    station: '🚆',
    utility: '⚡',
  },
  spaceNames: {
    0: 'PAYDAY',
    1: 'Woodward Avenue',
    2: 'Community Chest',
    3: 'Cass Avenue',
    4: 'IRS Office',
    5: 'Grand Central Terminal',
    6: 'Music Row',
    7: 'Chance',
    8: 'Demonbreun Street',
    9: 'Broadway',
    10: 'County Jail',
    11: 'South Street',
    12: 'Hoover Dam Power',
    13: 'Chestnut Street',
    14: 'Market Street',
    15: 'Union Station',
    16: 'Ocean Drive',
    17: 'Community Chest',
    18: 'Lincoln Road',
    19: 'Collins Avenue',
    20: 'Roadside Diner',
    21: 'Wacker Drive',
    22: 'Chance',
    23: 'State Street',
    24: 'Michigan Avenue',
    25: '30th Street Station',
    26: 'Sunset Boulevard',
    27: 'Hollywood Boulevard',
    28: 'Great Lakes Water',
    29: 'Rodeo Drive',
    30: 'Off to Jail',
    31: 'K Street',
    32: 'Massachusetts Avenue',
    33: 'Community Chest',
    34: 'Constitution Avenue',
    35: 'LA Union Station',
    36: 'Chance',
    37: 'Wall Street',
    38: 'Estate Tax',
    39: 'Fifth Avenue',
  },
  expandedSpaceNames: {
    0: 'PAYDAY',
    1: 'Woodward Avenue',
    2: 'Chance',
    3: 'Cass Avenue',
    4: 'Music Row',
    5: 'Demonbreun Street',
    6: 'Grand Central Terminal',
    7: 'Broadway',
    8: 'South Congress Avenue',
    9: 'Community Chest',
    10: 'East Sixth Street',
    11: 'Rainey Street',
    12: 'County Jail',
    13: 'Ocean Drive',
    14: 'Chance',
    15: 'Lincoln Road',
    16: 'Collins Avenue',
    17: 'Newbury Street',
    18: 'Union Station',
    19: 'Beacon Street',
    20: 'South Street',
    21: 'Great Lakes Water',
    22: 'Chestnut Street',
    23: 'Market Street',
    24: 'Roadside Diner',
    25: 'Wacker Drive',
    26: 'Community Chest',
    27: 'State Street',
    28: 'Michigan Avenue',
    29: 'Pike Place',
    30: '30th Street Station',
    31: 'Lombard Street',
    32: 'Sunset Boulevard',
    33: 'Hoover Dam Power',
    34: 'Hollywood Boulevard',
    35: 'Rodeo Drive',
    36: 'Off to Jail',
    37: 'K Street',
    38: 'Community Chest',
    39: 'Massachusetts Avenue',
    40: 'Constitution Avenue',
    41: 'Wall Street',
    42: 'LA Union Station',
    43: 'Fifth Avenue',
    44: 'Madison Avenue',
    45: 'Estate Tax',
    46: 'Park Avenue',
    47: 'Central Park South',
  },
  spaceLines: {
    0: ['PAYDAY'],
    1: ['Woodward', 'Avenue'],
    2: ['Community', 'Chest'],
    3: ['Cass', 'Avenue'],
    4: ['IRS', 'OFFICE'],
    5: ['Grand', 'Central'],
    6: ['Music', 'Row'],
    7: ['Chance'],
    8: ['Demonbreun', 'Street'],
    9: ['Broadway'],
    10: ['COUNTY', 'JAIL'],
    11: ['South', 'Street'],
    12: ['Hoover Dam', 'Power'],
    13: ['Chestnut', 'Street'],
    14: ['Market', 'Street'],
    15: ['Union', 'Station'],
    16: ['Ocean', 'Drive'],
    17: ['Community', 'Chest'],
    18: ['Lincoln', 'Road'],
    19: ['Collins', 'Avenue'],
    20: ['ROADSIDE', 'DINER'],
    21: ['Wacker', 'Drive'],
    22: ['Chance'],
    23: ['State', 'Street'],
    24: ['Michigan', 'Avenue'],
    25: ['30th St', 'Station'],
    26: ['Sunset', 'Blvd'],
    27: ['Hollywood', 'Blvd'],
    28: ['Great Lakes', 'Water'],
    29: ['Rodeo', 'Drive'],
    30: ['OFF TO', 'JAIL'],
    31: ['K', 'Street'],
    32: ['Mass.', 'Avenue'],
    33: ['Community', 'Chest'],
    34: ['Constitution', 'Avenue'],
    35: ['LA Union', 'Station'],
    36: ['Chance'],
    37: ['Wall', 'Street'],
    38: ['ESTATE', 'TAX'],
    39: ['Fifth', 'Avenue'],
  },
  expandedSpaceLines: {
    0: ['PAYDAY'],
    1: ['Woodward', 'Ave'],
    2: ['Chance'],
    3: ['Cass', 'Ave'],
    4: ['Music', 'Row'],
    5: ['Demonbreun', 'St'],
    6: ['Grand', 'Central'],
    7: ['Broadway'],
    8: ['S. Congress', 'Ave'],
    9: ['Community', 'Chest'],
    10: ['E. Sixth', 'St'],
    11: ['Rainey', 'St'],
    12: ['COUNTY', 'JAIL'],
    13: ['Ocean', 'Drive'],
    14: ['Chance'],
    15: ['Lincoln', 'Rd'],
    16: ['Collins', 'Ave'],
    17: ['Newbury', 'St'],
    18: ['Union', 'Station'],
    19: ['Beacon', 'St'],
    20: ['South', 'Street'],
    21: ['Great Lakes', 'Water'],
    22: ['Chestnut', 'St'],
    23: ['Market', 'St'],
    24: ['ROADSIDE', 'DINER'],
    25: ['Wacker', 'Drive'],
    26: ['Community', 'Chest'],
    27: ['State', 'St'],
    28: ['Michigan', 'Ave'],
    29: ['Pike', 'Place'],
    30: ['30th St', 'Station'],
    31: ['Lombard', 'St'],
    32: ['Sunset', 'Blvd'],
    33: ['Hoover Dam', 'Power'],
    34: ['Hollywood', 'Blvd'],
    35: ['Rodeo', 'Drive'],
    36: ['OFF TO', 'JAIL'],
    37: ['K', 'Street'],
    38: ['Community', 'Chest'],
    39: ['Mass.', 'Avenue'],
    40: ['Constitution', 'Ave'],
    41: ['Wall', 'Street'],
    42: ['LA Union', 'Station'],
    43: ['Fifth', 'Avenue'],
    44: ['Madison', 'Ave'],
    45: ['ESTATE', 'TAX'],
    46: ['Park', 'Avenue'],
    47: ['Central Park', 'South'],
  },
  boardPalette: AMERICA_PALETTE,
}

// ---------------------------------------------------------------------------
// Editions collection
// ---------------------------------------------------------------------------

export const MONOPOLY_EDITIONS: MonopolyThemeEdition[] = [
  CLASSIC_EDITION,
  PIRATE_EDITION,
  ARCTIC_EDITION,
  NAIJA_EDITION,
  AMERICA_EDITION,
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
export function themedSpaceName(
  canonicalName: string,
  spaceIndex: number,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = 40
): string {
  const edition = getMonopolyEdition(themeId)
  if (boardSize === 48 || spaceIndex >= 40) {
    return edition.expandedSpaceNames[spaceIndex] ?? canonicalName
  }
  const classicSpace = MONOPOLY_BOARD.find((space) => space.name === canonicalName)
  if (classicSpace) return edition.spaceNames[classicSpace.index] ?? canonicalName
  return edition.spaceNames[spaceIndex] ?? canonicalName
}

/** Get the themed two-line board tile label for a space. Returns null if no override exists. */
export function themedSpaceLines(
  canonicalName: string,
  spaceType: MonopolySpaceType,
  spaceIndex: number,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = 40
): string[] | null {
  const edition = getMonopolyEdition(themeId)
  if (edition.themeId === 'default') {
    if (boardSize === 48 && edition.expandedSpaceLines?.[spaceIndex]) {
      return edition.expandedSpaceLines[spaceIndex]!
    }
    return null
  }

  if (boardSize === 48 || spaceIndex >= 40) {
    if (edition.expandedSpaceLines?.[spaceIndex]) {
      return edition.expandedSpaceLines[spaceIndex]!
    }
    const themedName = edition.expandedSpaceNames[spaceIndex] ?? canonicalName
    const parts = themedName.split(' ')
    if (parts.length <= 1) return [themedName.toUpperCase()]
    if (parts.length === 2) return [parts[0]!.toUpperCase(), parts[1]!.toUpperCase()]
    const mid = Math.ceil(parts.length / 2)
    return [parts.slice(0, mid).join(' ').toUpperCase(), parts.slice(mid).join(' ').toUpperCase()]
  }

  const classicSpace = MONOPOLY_BOARD.find((space) => space.name === canonicalName)
  const themedIndex = classicSpace?.index ?? spaceIndex
  if (edition.spaceLines[themedIndex]) {
    return edition.spaceLines[themedIndex]!
  }
  const themedName = edition.spaceNames[themedIndex] ?? canonicalName
  const parts = themedName.split(' ')
  if (parts.length <= 1) return [themedName.toUpperCase()]
  if (parts.length === 2) return [parts[0]!.toUpperCase(), parts[1]!.toUpperCase()]
  const mid = Math.ceil(parts.length / 2)
  return [parts.slice(0, mid).join(' ').toUpperCase(), parts.slice(mid).join(' ').toUpperCase()]
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

/** Translate canonical London space names and £ currency in any text string to the active theme. */
export function formatThemedText(
  text: string | null | undefined,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = 40
): string {
  if (!text) return ''
  const edition = getMonopolyEdition(themeId)
  if (edition.themeId === 'default') return text

  let formatted = text
  const board = boardSize === 48 ? MONOPOLY_EXPANDED_BOARD : MONOPOLY_BOARD
  const spaceNamesMap = boardSize === 48 ? edition.expandedSpaceNames : edition.spaceNames
  const spacesSorted = [...board].sort((a, b) => b.name.length - a.name.length)
  for (const space of spacesSorted) {
    const themed = spaceNamesMap[space.index]
    if (themed && themed !== space.name) {
      const pattern = new RegExp(`\\b${escapeRegExp(space.name)}\\b`, 'g')
      formatted = formatted.replace(pattern, themed)
    }
  }

  formatted = formatted.replace(/\bLondon board\b/g, `${edition.editionName} board`)
  formatted = formatted.replace(/\bLondon Edition\b/g, `${edition.editionName} Edition`)
  formatted = formatted.replace(/\bLondon edition\b/g, `${edition.editionName} edition`)

  if (edition.themeId === 'naija') {
    formatted = formatted.replace(/£(\d+(?:,\d+)*(?:\.\d+)?)/g, (_, numStr) => {
      const num = parseFloat(numStr.replace(/,/g, ''))
      return `${edition.currencySymbol}${canonicalToDisplayMoney(num, themeId).toLocaleString('en-GB')}`
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
