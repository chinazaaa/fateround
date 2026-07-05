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
  customDecoration?: 'pirate' | 'none'
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
  titleFont: 'font-pirate font-normal tracking-wide',
  subtitleFont: 'font-naval font-normal tracking-widest',
  tileFont: 'font-chart',
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

/** All Monopoly theme editions, in picker display order. */
export const MONOPOLY_EDITIONS: MonopolyThemeEdition[] = [CLASSIC_EDITION, PIRATE_EDITION]

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

/** Format a money amount with the themed currency symbol. */
export function formatThemedMoney(amount: number, themeId?: string | null): string {
  const edition = getMonopolyEdition(themeId)
  return `${edition.currencySymbol}${amount.toLocaleString('en-GB')}`
}

/** Get the board visual palette for a theme. */
export function getBoardPalette(themeId?: string | null): MonopolyBoardPalette {
  return getMonopolyEdition(themeId).boardPalette
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
      formatted = formatted.split(space.name).join(themed)
    }
  }

  formatted = formatted.replace(/£(\d+(?:,\d+)*(?:\.\d+)?)/g, `${edition.currencySymbol}$1`)
  formatted = formatted.replace(/£/g, edition.currencySymbol)

  return formatted
}
