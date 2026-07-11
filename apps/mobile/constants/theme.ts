/** Fate Round mobile design tokens — light + dark, semantic parity. */

// Shape-only tokens shared by both schemes.
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

export type Theme = ThemeColors & {
  radius: typeof radius
  space: typeof space
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

export const darkTheme: Theme = { ...darkColors, radius, space }
export const lightTheme: Theme = { ...lightColors, radius, space }

/**
 * Backwards-compatible default. Dark is the app's historical look, so any module
 * that still imports the static `theme` keeps rendering dark. Runtime-themed
 * components should use `useTheme()` / `useThemedStyles()` instead.
 */
export const theme = darkTheme
