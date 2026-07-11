import type { ThemeId } from '@fateround/shared/create-themes'
import type { ThemeColors } from '@/constants/theme'

/**
 * Per-game visual themes (the "Neon / Retro / Elegant / Tropical" edition picker
 * in create + lobby settings), ported from the web `THEME_MAP` (src/lib/themes.ts).
 *
 * On web these are CSS-variable palettes applied to the document root. On mobile
 * we express the same intent as overrides on our design tokens: when a game theme
 * is active we merge these over the base light/dark theme, so every already-
 * tokenized game screen recolors automatically (see GameThemeProvider).
 *
 * Each theme is a self-contained palette (Neon is always dark-cyan, Retro always
 * warm-cream, etc.) — like the web, it replaces the base scheme rather than
 * layering on light/dark. Translucent web values (`rgba(...)` cards/borders) are
 * resolved to the nearest solid hex.
 *
 * `pirate`/`arctic`/`naija` are the Monopoly editions; these overrides recolor the
 * Monopoly chrome (panels, buttons, text). The Monopoly *board* itself (tile
 * colors, currency symbol, themed property names) is a separate, richer port
 * (web `monopoly-themes.ts`) not yet done on mobile — the board keeps its default
 * look for now.
 */
export const GAME_THEME_OVERRIDES: Partial<Record<ThemeId, Partial<ThemeColors>>> = {
  neon: {
    bg: '#0a0a14',
    bgElevated: '#0e0e1a',
    surface: '#101a24',
    surfaceHover: '#152633',
    border: '#173039',
    borderAccent: '#00e5ff55',
    primary: '#00e5ff',
    primarySoft: '#07222b',
    primaryMuted: '#80deea',
    text: '#e0ffe0',
    textSecondary: '#a8f0cc',
    textMuted: '#8cf0c0',
    textFaint: '#4a8a6a',
  },
  retro: {
    bg: '#faf3e6',
    bgElevated: '#fff8ee',
    surface: '#fffdf7',
    surfaceHover: '#fbf1df',
    border: '#e7d6bf',
    borderAccent: '#d9770655',
    primary: '#d97706',
    primarySoft: '#f6e6cf',
    primaryMuted: '#b45309',
    text: '#3d2b1f',
    textSecondary: '#5c4636',
    textMuted: '#7a6352',
    textFaint: '#a99582',
  },
  elegant: {
    bg: '#0c0f1a',
    bgElevated: '#111627',
    surface: '#141828',
    surfaceHover: '#1a1e32',
    border: '#2b2f45',
    borderAccent: '#d4a84355',
    primary: '#d4a843',
    primarySoft: '#221d10',
    primaryMuted: '#e5c76a',
    text: '#f0ead6',
    textSecondary: '#cebfa0',
    textMuted: '#b8a88a',
    textFaint: '#6e6350',
  },
  tropical: {
    bg: '#0a1a1a',
    bgElevated: '#0f2222',
    surface: '#122a2a',
    surfaceHover: '#163232',
    border: '#154040',
    borderAccent: '#ff6b6b55',
    primary: '#ff6b6b',
    primarySoft: '#2a1414',
    primaryMuted: '#ff9090',
    text: '#e0f7f4',
    textSecondary: '#a8dcd6',
    textMuted: '#80cbc4',
    textFaint: '#4a8a82',
  },
  // --- Monopoly editions (warm parchment / icy / green-cream) -----------------
  pirate: {
    bg: '#d9c7a3',
    bgElevated: '#e2d4b7',
    surface: '#ebe0c8',
    surfaceHover: '#f0e6d2',
    border: '#d3bd8f',
    borderAccent: '#b8860b55',
    primary: '#b8860b',
    primarySoft: '#ece0c0',
    primaryMuted: '#8a5a0b',
    text: '#2b1b0e',
    textSecondary: '#4a3420',
    textMuted: '#5c4326',
    textFaint: '#8c6f4b',
  },
  arctic: {
    bg: '#eaf2f5',
    bgElevated: '#d8e6eb',
    surface: '#f0f6f8',
    surfaceHover: '#e3eef1',
    border: '#c3d6dd',
    borderAccent: '#1e4e6b55',
    primary: '#1e4e6b',
    primarySoft: '#d5e6ec',
    primaryMuted: '#17435c',
    text: '#1b2a32',
    textSecondary: '#34474f',
    textMuted: '#5c6b73',
    textFaint: '#7d8f99',
  },
  naija: {
    bg: '#f4ede1',
    bgElevated: '#e8dfce',
    surface: '#fbf6ec',
    surfaceHover: '#efe6d5',
    border: '#d3cbb6',
    borderAccent: '#00875155',
    primary: '#008751',
    primarySoft: '#dcecdf',
    primaryMuted: '#006b40',
    text: '#1a1f1c',
    textSecondary: '#33403a',
    textMuted: '#4a5750',
    textFaint: '#6a7970',
  },
}

/** Whether a theme id has a general palette override (i.e. recolors game chrome). */
export function hasGameThemeOverride(themeId: ThemeId): boolean {
  return themeId in GAME_THEME_OVERRIDES
}
