/**
 * FateRound mobile design tokens — light + dark, semantic parity.
 *
 * Structured as three layers (docs/mobile-revamp-plan.md):
 *   1. Foundation: raw scales that never change per-theme (radius, space,
 *      type sizes, elevation depths).
 *   2. Semantic per-scheme: role names (`bg`, `text`, `surface`, `elevated`)
 *      that mean the same thing in light + dark. Component code reads these.
 *   3. Component tokens: derived per-primitive (button, card, listRow).
 *      Consumers rarely touch these directly; they're for primitive authors.
 *
 * The three-layer split is what makes the Premium arc a swap, not a rewrite:
 * a new colour palette re-populates layer 1, semantic roles stay stable, and
 * every primitive keeps rendering.
 */

// ── Layer 1: foundation (shape-only, shared) ────────────────────────────────

const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
} as const

const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
} as const

/**
 * Type scale — named-by-intent so components don't hardcode font sizes.
 * Line heights follow the "1.35 for body / 1.2 for display" rule so
 * headings feel tight and body reads comfortable.
 */
const type = {
  display: { size: 32, lineHeight: 38, weight: '800' as const, letterSpacing: -0.5 },
  title: { size: 22, lineHeight: 28, weight: '800' as const, letterSpacing: -0.2 },
  section: { size: 17, lineHeight: 22, weight: '700' as const, letterSpacing: 0 },
  body: { size: 15, lineHeight: 21, weight: '400' as const, letterSpacing: 0 },
  label: { size: 14, lineHeight: 18, weight: '600' as const, letterSpacing: 0.1 },
  caption: { size: 12, lineHeight: 16, weight: '500' as const, letterSpacing: 0.2 },
} as const

/**
 * Elevation levels — depth semantic, not literal shadow values. Each layer
 * expresses how far above the base surface the element sits. Actual shadow
 * numbers are derived per-scheme (dark mode shadows are deeper + softer to
 * read against the near-black background; light mode uses fine subtle shadows).
 */
const elevationLevels = ['none', 'raised', 'floating', 'overlay'] as const
export type ElevationLevel = (typeof elevationLevels)[number]

/** Colour roles. Every role means the same thing in both schemes, so a style
 *  written against one reads correctly against the other. */
export type ThemeColors = {
  bg: string
  bgElevated: string
  surface: string
  surfaceHover: string
  border: string
  borderAccent: string
  primary: string
  primarySoft: string
  /** Accent text drawn on top of `bg`/`primarySoft`. Light in dark mode,
   *  deep in light mode — the role (readable accent) is what's preserved. */
  primaryMuted: string
  text: string
  textSecondary: string
  textMuted: string
  textFaint: string
  error: string
  success: string
}

/**
 * Per-primitive derived tokens. Authors of Button / Card / ListRow read
 * these instead of composing raw semantics — that way an intent change
 * ("cards feel a bit softer") lives in one place.
 */
export type ElevationStyle = {
  shadowColor: string
  shadowOffset: { width: number; height: number }
  shadowOpacity: number
  shadowRadius: number
  /** Android */
  elevation: number
}

export type ComponentTokens = {
  button: {
    height: { sm: number; md: number; lg: number }
    paddingX: { sm: number; md: number; lg: number }
    radius: number
  }
  card: {
    padding: number
    radius: number
  }
  listRow: {
    minHeight: number
    paddingX: number
    dividerColor: string
  }
  elevation: Record<ElevationLevel, ElevationStyle>
}

export type Theme = ThemeColors & {
  radius: typeof radius
  space: typeof space
  type: typeof type
  components: ComponentTokens
}

const darkColors: ThemeColors = {
  bg: '#0b0b0f',
  bgElevated: '#121218',
  surface: '#17171d',
  surfaceHover: '#1c1c24',
  border: '#2a2a35',
  borderAccent: '#f43f5e44',
  primary: '#f43f5e',
  primarySoft: '#3f1d2b',
  primaryMuted: '#fda4af',
  text: '#ffffff',
  textSecondary: '#d1d5db',
  textMuted: '#9ca3af',
  textFaint: '#6b7280',
  error: '#f87171',
  success: '#4ade80',
}

const lightColors: ThemeColors = {
  bg: '#f6f6f9',
  bgElevated: '#ffffff',
  surface: '#ffffff',
  surfaceHover: '#f1f1f5',
  border: '#e3e3ec',
  borderAccent: '#e11d4855',
  primary: '#e11d48',
  primarySoft: '#ffe4e9',
  primaryMuted: '#be123c',
  text: '#0b0b0f',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  error: '#dc2626',
  success: '#16a34a',
}

/**
 * Elevation per scheme. Dark mode uses deeper, softer shadows so cards
 * read above the near-black background; light mode uses subtle shadows
 * that don't compete with the page.
 */
function buildElevation(scheme: 'dark' | 'light'): Record<ElevationLevel, ElevationStyle> {
  const isDark = scheme === 'dark'
  return {
    none: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    raised: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.4 : 0.06,
      shadowRadius: isDark ? 8 : 4,
      elevation: 2,
    },
    floating: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.5 : 0.1,
      shadowRadius: isDark ? 16 : 12,
      elevation: 6,
    },
    overlay: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.55 : 0.14,
      shadowRadius: isDark ? 24 : 18,
      elevation: 12,
    },
  }
}

function buildComponents(colors: ThemeColors, elevation: Record<ElevationLevel, ElevationStyle>): ComponentTokens {
  return {
    button: {
      height: { sm: 40, md: 48, lg: 56 },
      paddingX: { sm: 14, md: 18, lg: 22 },
      radius: radius.md,
    },
    card: {
      padding: space.md,
      radius: radius.lg,
    },
    listRow: {
      minHeight: 56,
      paddingX: space.md,
      dividerColor: colors.border,
    },
    elevation,
  }
}

const darkElevation = buildElevation('dark')
const lightElevation = buildElevation('light')

export const darkTheme: Theme = {
  ...darkColors,
  radius,
  space,
  type,
  components: buildComponents(darkColors, darkElevation),
}

export const lightTheme: Theme = {
  ...lightColors,
  radius,
  space,
  type,
  components: buildComponents(lightColors, lightElevation),
}

/**
 * Backwards-compatible default. Dark is the app's historical look, so any module
 * that still imports the static `theme` keeps rendering dark. Runtime-themed
 * components should use `useTheme()` / `useThemedStyles()` instead.
 */
export const theme = darkTheme
