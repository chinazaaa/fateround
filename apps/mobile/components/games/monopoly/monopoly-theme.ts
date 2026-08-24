import {
  MONOPOLY_BOARD_SIZE,
  MONOPOLY_EXPANDED_BOARD_SIZE,
  monopolyBoardForSize,
  type MonopolyBoardSize,
  type MonopolySpaceType,
} from '@fateround/shared/monopoly-board'

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
  decoration: 'none' | 'pirate' | 'arctic' | 'naija' | 'america' | 'christmas'
}

interface MonopolyEdition {
  themeId: string
  currencySymbol: string
  currencyWord: string
  /** Money multiplier for display (Naija shows values ×1000). */
  moneyScale: number
  editionSubtitle: string
  boardTitle: string
  /** Themed display names keyed by space index (0–39) for the 40-space board. */
  spaceNames: Partial<Record<number, string>>
  /** Themed display names for all spaces on the 48-space board (0–47). */
  expandedSpaceNames: Partial<Record<number, string>>
  typeIcons: Partial<Record<MonopolySpaceType, string>>
  /** Optional themed two-line labels for the 40-space board grid, keyed by space index. */
  spaceLines?: Partial<Record<number, string[]>>
  /** Optional themed two-line labels for the 48-space board grid, keyed by space index. */
  expandedSpaceLines?: Partial<Record<number, string[]>>
  boardPalette: MonopolyBoardPalette
}

// FateRound-branded slate + rose Classic palette (mobile mirror of the web
// CLASSIC_PALETTE — see src/components/monopoly/monopoly-themes.ts).
const CLASSIC_PALETTE: MonopolyBoardPalette = {
  boardBg: '#1e293b',
  boardBorder: '#f43f5e',
  centerBg: '#0f172a',
  tileBg: '#faf8f2',
  cornerBg: '#f5f5f4',
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
  editionSubtitle: 'London Edition',
  boardTitle: 'ESTATE KINGS',
  spaceNames: {},
  expandedSpaceNames: {
    0: 'PAYDAY',
    1: 'Thamesmead Walk',
    2: 'Fate',
    3: 'Croydon High',
    4: 'Erith Road',
    5: 'Barking Road',
    6: 'Paddington',
    7: 'Dagenham Ave',
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
  typeIcons: {},
  expandedSpaceLines: {
    0: ['PAYDAY'],
    1: ['Thamesmead', 'Walk'],
    2: ['Fate'],
    3: ['Croydon', 'High'],
    4: ['Erith', 'Road'],
    5: ['Barking', 'Road'],
    6: ['Paddington'],
    7: ['Dagenham', 'Ave'],
    8: ['Canary', 'Wharf'],
    9: ['Esusu', 'Fund'],
    10: ['Bermondsey'],
    11: ['Limehouse'],
    12: ['NICKED'],
    13: ['Walthamstow'],
    14: ['Market', 'Shock'],
    15: ['Peckham', 'Rye'],
    16: ['Deptford', 'Way'],
    17: ['Hampstead'],
    18: ['Waterloo'],
    19: ['Islington'],
    20: ['Ilford', 'Lane'],
    21: ['Water', 'Board'],
    22: ['Romford', 'Road'],
    23: ['Enfield', 'Town'],
    24: ['LAY-BY'],
    25: ['Stratford', 'Cross'],
    26: ['Community', 'Grant'],
    27: ['Hackney', 'Wick'],
    28: ['Brixton', 'Hill'],
    29: ['Shoreditch'],
    30: ['Victoria'],
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
  expandedSpaceNames: {
    0: 'Port Royale',
    1: 'Santo Domingo',
    2: "Ship's Log",
    3: 'San Juan',
    4: 'Cartagena',
    5: 'Tortuga',
    6: "Q.A.'s Revenge",
    7: 'Sainte-Marie',
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
  expandedSpaceLines: {
    0: ['Port', 'Royale'],
    1: ['Santo', 'Domingo'],
    2: ["Ship's", 'Log'],
    3: ['San', 'Juan'],
    4: ['Cartagena'],
    5: ['Tortuga'],
    6: ["Q.A.'s", 'Revenge'],
    7: ['Sainte', 'Marie'],
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
  expandedSpaceNames: {
    0: 'Base Camp',
    1: 'Svalbard',
    2: 'Polar Compass',
    3: 'Lapland',
    4: 'Glacier Bay',
    5: 'Klondike Trail',
    6: 'McMurdo Station',
    7: 'Donner Pass',
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
  expandedSpaceLines: {
    0: ['BASE', 'CAMP'],
    1: ['SVALBARD'],
    2: ['POLAR', 'COMPASS'],
    3: ['LAPLAND'],
    4: ['GLACIER', 'BAY'],
    5: ['KLONDIKE', 'TRAIL'],
    6: ['MCMURDO', 'STATION'],
    7: ['DONNER', 'PASS'],
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
  expandedSpaceNames: {
    0: 'Oshodi Bus Terminal',
    1: 'Ariaria Market',
    2: 'Trade Venture',
    3: 'Niger Bridge',
    4: 'Ogbunike Caves',
    5: 'Oshodi Market',
    6: 'Iddo Terminal',
    7: 'Sabon Gari',
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
  expandedSpaceLines: {
    0: ['OSHODI BUS', 'TERMINAL'],
    1: ['ARIARIA', 'MARKET'],
    2: ['TRADE', 'VENTURE'],
    3: ['NIGER', 'BRIDGE'],
    4: ['OGBUNIKE', 'CAVES'],
    5: ['OSHODI', 'MARKET'],
    6: ['IDDO', 'TERMINAL'],
    7: ['SABON', 'GARI'],
    8: ['APAPA', 'WHARF'],
    9: ['ESUSU', 'FUND'],
    10: ['WUSE', 'MARKET'],
    11: ['AKOWONJO'],
    12: ['KIRIKIRI'],
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
// USA edition — first paid drop (see docs/estate-kings-america-edition.md).
// Names and prices copied verbatim from the spec.
// ---------------------------------------------------------------------------

const AMERICA_PALETTE: MonopolyBoardPalette = {
  boardBg: '#0F1A38',
  boardBorder: '#C9A44C',
  centerBg: '#132348',
  tileBg: '#FBF6E6',
  cornerBg: '#F4ECD8',
  tileText: '#1B2340',
  highlightBorder: '#C9A44C',
  decoration: 'america',
}

const AMERICA_EDITION: MonopolyEdition = {
  themeId: 'america',
  currencySymbol: '$',
  currencyWord: 'dollars',
  moneyScale: 1,
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
// Christmas edition — seasonal paid drop (docs/estate-kings-christmas-edition.md).
// ---------------------------------------------------------------------------

const CHRISTMAS_PALETTE: MonopolyBoardPalette = {
  boardBg: '#0F2A1A',
  boardBorder: '#C8102E',
  centerBg: '#123821',
  tileBg: '#FBF6E4',
  cornerBg: '#F6EFD7',
  tileText: '#1B2A20',
  highlightBorder: '#C8102E',
  decoration: 'christmas',
}

const CHRISTMAS_EDITION: MonopolyEdition = {
  themeId: 'christmas',
  currencySymbol: '$',
  currencyWord: 'dollars',
  moneyScale: 1,
  editionSubtitle: 'Christmas Edition',
  boardTitle: 'ESTATE KINGS',
  typeIcons: {
    go: '🎁',
    chance: '🧦',
    community: '🎄',
    tax: '🧾',
    jail: '🪵',
    go_to_jail: '📜',
    free_parking: '🔥',
    station: '🛷',
    utility: '✨',
  },
  spaceNames: {
    0: 'PAYDAY',
    1: 'Stocking Row',
    2: 'Gift Under the Tree',
    3: 'Chimney Lane',
    4: 'Toll Booth',
    5: 'Northern Sleigh Depot',
    6: "Carolers' Corner",
    7: 'Stocking Stuffer',
    8: 'Wreath Way',
    9: 'Village Green',
    10: 'Coal Bin',
    11: 'Gingerbread Lane',
    12: 'Northern Lights Co.',
    13: 'Cocoa Court',
    14: 'Candy Cane Boulevard',
    15: 'Frostwind Junction',
    16: 'Toybox Alley',
    17: 'Gift Under the Tree',
    18: 'Wooden Soldier Row',
    19: 'Nutcracker Square',
    20: 'Cozy Fireside',
    21: 'Pine Ridge',
    22: 'Stocking Stuffer',
    23: 'Fir Forest Road',
    24: 'Snowfall Boulevard',
    25: 'Silverbell Terminal',
    26: 'Firelight Lane',
    27: 'Golden Bell Row',
    28: 'Frostwater Springs',
    29: "Angel's Terrace",
    30: 'On the Naughty List',
    31: 'Mistletoe Manor Drive',
    32: 'Holly Grove',
    33: 'Gift Under the Tree',
    34: 'Evergreen Boulevard',
    35: 'Winterhaven Depot',
    36: 'Stocking Stuffer',
    37: "Santa's Workshop",
    38: 'Sleigh Tax',
    39: 'North Pole Plaza',
  },
  expandedSpaceNames: {
    0: 'PAYDAY',
    1: 'Stocking Row',
    2: 'Stocking Stuffer',
    3: 'Chimney Lane',
    4: "Carolers' Corner",
    5: 'Wreath Way',
    6: 'Northern Sleigh Depot',
    7: 'Village Green',
    8: 'Reindeer Trail',
    9: 'Gift Under the Tree',
    10: 'Sleigh Bell Lane',
    11: "Prancer's Path",
    12: 'Coal Bin',
    13: 'Toybox Alley',
    14: 'Stocking Stuffer',
    15: 'Wooden Soldier Row',
    16: 'Nutcracker Square',
    17: 'Icicle Row',
    18: 'Frostwind Junction',
    19: 'Snowflake Terrace',
    20: 'Gingerbread Lane',
    21: 'Frostwater Springs',
    22: 'Cocoa Court',
    23: 'Candy Cane Boulevard',
    24: 'Cozy Fireside',
    25: 'Pine Ridge',
    26: 'Gift Under the Tree',
    27: 'Fir Forest Road',
    28: 'Snowfall Boulevard',
    29: 'Aurora Boulevard',
    30: 'Silverbell Terminal',
    31: 'Starlight Circle',
    32: 'Firelight Lane',
    33: 'Northern Lights Co.',
    34: 'Golden Bell Row',
    35: "Angel's Terrace",
    36: 'On the Naughty List',
    37: 'Mistletoe Manor Drive',
    38: 'Gift Under the Tree',
    39: 'Holly Grove',
    40: 'Evergreen Boulevard',
    41: "Santa's Workshop",
    42: 'Winterhaven Depot',
    43: 'North Pole Plaza',
    44: 'Ornament Court',
    45: 'Sleigh Tax',
    46: 'Tinsel Terrace',
    47: 'Grand Sleigh Approach',
  },
  expandedSpaceLines: {
    0: ['PAYDAY'],
    1: ['Stocking', 'Row'],
    2: ['Stocking', 'Stuffer'],
    3: ['Chimney', 'Lane'],
    4: ['Carolers', 'Corner'],
    5: ['Wreath', 'Way'],
    6: ['Northern', 'Sleigh'],
    7: ['Village', 'Green'],
    8: ['Reindeer', 'Trail'],
    9: ['Gift Under', 'Tree'],
    10: ['Sleigh Bell', 'Lane'],
    11: ["Prancer's", 'Path'],
    12: ['COAL', 'BIN'],
    13: ['Toybox', 'Alley'],
    14: ['Stocking', 'Stuffer'],
    15: ['Wooden', 'Soldier'],
    16: ['Nutcracker', 'Square'],
    17: ['Icicle', 'Row'],
    18: ['Frostwind', 'Junction'],
    19: ['Snowflake', 'Terrace'],
    20: ['Gingerbread', 'Lane'],
    21: ['Frostwater', 'Springs'],
    22: ['Cocoa', 'Court'],
    23: ['Candy Cane', 'Blvd'],
    24: ['COZY', 'FIRESIDE'],
    25: ['Pine', 'Ridge'],
    26: ['Gift Under', 'Tree'],
    27: ['Fir Forest', 'Road'],
    28: ['Snowfall', 'Blvd'],
    29: ['Aurora', 'Blvd'],
    30: ['Silverbell', 'Terminal'],
    31: ['Starlight', 'Circle'],
    32: ['Firelight', 'Lane'],
    33: ['Northern', 'Lights'],
    34: ['Golden', 'Bell Row'],
    35: ["Angel's", 'Terrace'],
    36: ['NAUGHTY', 'LIST'],
    37: ['Mistletoe', 'Manor'],
    38: ['Gift Under', 'Tree'],
    39: ['Holly', 'Grove'],
    40: ['Evergreen', 'Blvd'],
    41: ["Santa's", 'Workshop'],
    42: ['Winterhaven', 'Depot'],
    43: ['North Pole', 'Plaza'],
    44: ['Ornament', 'Court'],
    45: ['SLEIGH', 'TAX'],
    46: ['Tinsel', 'Terrace'],
    47: ['Grand', 'Sleigh App.'],
  },
  boardPalette: CHRISTMAS_PALETTE,
}

const EDITIONS: MonopolyEdition[] = [
  CLASSIC_EDITION,
  PIRATE_EDITION,
  ARCTIC_EDITION,
  NAIJA_EDITION,
  AMERICA_EDITION,
  CHRISTMAS_EDITION,
]
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

/**
 * Themed display name for a space, falling back to the canonical name.
 * When `boardSize === 48` (or the index is beyond the classic 40 tiles) the
 * edition's `expandedSpaceNames` is used.
 */
export function themedSpaceName(
  canonicalName: string,
  spaceIndex: number,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE
): string {
  const edition = getMonopolyEdition(themeId)
  if (boardSize === MONOPOLY_EXPANDED_BOARD_SIZE || spaceIndex >= MONOPOLY_BOARD_SIZE) {
    return edition.expandedSpaceNames[spaceIndex] ?? canonicalName
  }
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

/**
 * Split a tile name into short lines — full words, split across at most two rows.
 * Mobile port of the web `boardSpaceLines` (src/components/monopoly/monopoly-ui.ts).
 * Emoji glyphs are intentionally omitted here — the board renders the type icon
 * separately, so corner tiles show e.g. "GO" + the icon rather than a baked glyph.
 */
export function boardSpaceLines(
  name: string,
  type: MonopolySpaceType,
  spaceIndex?: number,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE
): string[] {
  const edition = getMonopolyEdition(themeId)
  // On the 48-space board (or beyond-classic indices) prefer the edition's
  // pre-baked two-line labels when the theme provides them.
  if (
    spaceIndex != null &&
    (boardSize === MONOPOLY_EXPANDED_BOARD_SIZE || spaceIndex >= MONOPOLY_BOARD_SIZE) &&
    edition.expandedSpaceLines?.[spaceIndex]
  ) {
    return edition.expandedSpaceLines[spaceIndex]!
  }
  if (
    spaceIndex != null &&
    boardSize === MONOPOLY_BOARD_SIZE &&
    spaceIndex < MONOPOLY_BOARD_SIZE &&
    edition.spaceLines?.[spaceIndex]
  ) {
    return edition.spaceLines[spaceIndex]!
  }
  const displayName = spaceIndex != null ? themedSpaceName(name, spaceIndex, themeId, boardSize) : name
  const known: Record<string, string[]> = {
    PAYDAY: ['PAYDAY'],
    NICKED: ['NICKED'],
    'LAY-BY': ['LAY-BY'],
    'OFF TO JAIL': ['OFF TO', 'JAIL'],
    'TAX OFFICE': ['TAX', 'OFFICE'],
    SURCHARGE: ['SURCHARGE'],
    Kitty: ['Kitty'],
    Fate: ['Fate'],
    'Barking Road': ['Barking', 'Road'],
    'Dagenham Avenue': ['Dagenham', 'Avenue'],
    'Thamesmead Walk': ['Thamesmead', 'Walk'],
    'Croydon High Street': ['Croydon', 'High St'],
    'Erith Road': ['Erith', 'Road'],
    'Ilford Lane': ['Ilford', 'Lane'],
    'Romford Road': ['Romford', 'Road'],
    'Enfield Town': ['Enfield', 'Town'],
    'Walthamstow Market': ['Walthamstow', 'Market'],
    'Peckham Rye': ['Peckham', 'Rye'],
    'Deptford Broadway': ['Deptford', 'Broadway'],
    'Stratford Cross': ['Stratford', 'Cross'],
    'Hackney Wick': ['Hackney', 'Wick'],
    'Brixton Hill': ['Brixton', 'Hill'],
    'Clapham Common': ['Clapham', 'Common'],
    'Fulham Broadway': ['Fulham', 'Broadway'],
    'Battersea Rise': ['Battersea', 'Rise'],
    'Marylebone Lane': ['Marylebone', 'Lane'],
    'Notting Hill Gate': ['Notting Hill', 'Gate'],
    'South Kensington': ['South', 'Kensington'],
    'Chester Square': ['Chester', 'Square'],
    'Winnington Road': ['Winnington', 'Road'],
    Paddington: ['Paddington'],
    Waterloo: ['Waterloo'],
    Victoria: ['Victoria'],
    'London Bridge': ['London', 'Bridge'],
    'Power Company': ['Power', 'Company'],
    'Water Board': ['Water', 'Board'],
  }
  if (known[displayName]) return known[displayName]
  if (type === 'station') {
    const label = displayName.replace(' Station', '')
    const words = label.split(' ')
    if (words.length >= 2) return [words.slice(0, -1).join(' '), 'Station']
    return [label, 'Station']
  }
  if (type === 'utility') {
    const parts = displayName.split(' ')
    return parts.length > 1 ? [parts[0]!, parts.slice(1).join(' ')] : [displayName]
  }
  if (displayName.endsWith(' Road')) return [displayName.replace(' Road', ''), 'Road']
  if (displayName.endsWith(' Street')) return [displayName.replace(' Street', ''), 'Street']
  if (displayName.endsWith(' Square')) return [displayName.replace(' Square', ''), 'Square']
  if (displayName.endsWith(' Avenue')) return [displayName.replace(' Avenue', ''), 'Avenue']
  const parts = displayName.split(' ')
  if (parts.length <= 2) return parts
  return [parts.slice(0, 2).join(' '), parts.slice(2).join(' ')]
}

const MOBILE_ABBR: Record<string, string> = {
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

/**
 * Abbreviated word list sized for the tiny mobile board tiles.
 * Mobile port of the web `mobileBoardSpaceLines`. Each entry is rendered on its
 * own line so long names ("Marlborough Street" → "Marlb." / "St") never clip.
 */
export function mobileBoardSpaceLines(
  name: string,
  type: MonopolySpaceType,
  spaceIndex?: number,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE
): string[] {
  const fullLines = boardSpaceLines(name, type, spaceIndex, themeId, boardSize)
  const words: string[] = []
  for (const line of fullLines) {
    let shortened = line
    if (shortened.includes('AHMADU')) {
      words.push('AHMADU B.')
      continue
    }
    if (shortened.includes('BELLO')) {
      if (shortened.includes('WAY')) words.push('WAY')
      continue
    }
    if (shortened.trim() === 'TIN CAN' || shortened.includes('NEPA') || shortened.trim() === 'MILE 12') {
      words.push(shortened.includes('NEPA') ? 'NEPA /' : shortened.trim())
      continue
    }
    for (const [full, short] of Object.entries(MOBILE_ABBR)) {
      if (shortened === full) shortened = short
      else if (shortened.includes(full)) shortened = shortened.replace(full, short)
    }
    for (const word of shortened.trim().split(/\s+/)) {
      if (word.length > 8) words.push(`${word.slice(0, 7)}.`)
      else if (word) words.push(word)
    }
  }
  return words
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
export function formatThemedText(
  text: string | null | undefined,
  themeId?: string | null,
  boardSize: MonopolyBoardSize = MONOPOLY_BOARD_SIZE
): string {
  if (!text) return ''
  const edition = getMonopolyEdition(themeId)
  if (edition.themeId === 'default') return text

  let formatted = text
  const board = monopolyBoardForSize(boardSize)
  const nameLookup = boardSize === MONOPOLY_EXPANDED_BOARD_SIZE ? edition.expandedSpaceNames : edition.spaceNames
  const spacesSorted = [...board].sort((a, b) => b.name.length - a.name.length)
  for (const space of spacesSorted) {
    const themed = nameLookup[space.index]
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
    // Function replacer — a string replacement of `${'$'}$1` = "$$1" is
    // parsed by String.replace as an escaped `$` + literal `1`, dropping
    // the captured amount. Same fix as web `formatThemedText`.
    formatted = formatted.replace(/£(\d+(?:,\d+)*(?:\.\d+)?)/g, (_, num: string) => `${edition.currencySymbol}${num}`)
  }
  formatted = formatted.replace(/£/g, edition.currencySymbol)
  if (edition.currencyWord !== 'pounds') {
    formatted = formatted.replace(/\bpounds\b/g, edition.currencyWord)
    formatted = formatted.replace(/\bPounds\b/g, edition.currencyWord[0].toUpperCase() + edition.currencyWord.slice(1))
  }
  return formatted
}
