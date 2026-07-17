export type ThemeId =
  | 'default'
  | 'neon'
  | 'retro'
  | 'elegant'
  | 'tropical'
  | 'pirate'
  | 'arctic'
  | 'naija'
  | 'grass_court'

export interface ThemeConfig {
  id: ThemeId
  label: string
  emoji: string
  preview: { bg: string; accent: string; text: string }
  cssVars: Record<string, string>
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'default',
    label: 'Default',
    emoji: '🎲',
    preview: { bg: '#08080f', accent: '#f43f5e', text: '#f2f2f8' },
    cssVars: {},
  },
  {
    id: 'neon',
    label: 'Neon',
    emoji: '💡',
    preview: { bg: '#0a0a14', accent: '#00e5ff', text: '#e0ffe0' },
    // Palette lives in globals.css (light + dark) under [data-game-theme='neon'].
    cssVars: {},
  },
  {
    id: 'retro',
    label: 'Retro',
    emoji: '📺',
    preview: { bg: '#faf3e6', accent: '#d97706', text: '#3d2b1f' },
    // Palette lives in globals.css (light + dark) under [data-game-theme='retro'].
    cssVars: {},
  },
  {
    id: 'elegant',
    label: 'Elegant',
    emoji: '✨',
    preview: { bg: '#0c0f1a', accent: '#d4a843', text: '#f0ead6' },
    // Palette lives in globals.css (light + dark) under [data-game-theme='elegant'].
    cssVars: {},
  },
  {
    id: 'tropical',
    label: 'Tropical',
    emoji: '🌴',
    preview: { bg: '#0a1a1a', accent: '#ff6b6b', text: '#e0f7f4' },
    // Palette lives in globals.css (light + dark) under [data-game-theme='tropical'].
    cssVars: {},
  },
  {
    id: 'pirate',
    label: 'Pirate',
    emoji: '🏴‍☠️',
    preview: { bg: '#0B2545', accent: '#D4AF37', text: '#EFE3C8' },
    cssVars: {},
  },
  {
    id: 'arctic',
    label: 'Arctic Exploration',
    emoji: '🧭',
    preview: { bg: '#0A1A2A', accent: '#3FA9A0', text: '#D8E6E8' },
    cssVars: {},
  },
  {
    id: 'naija',
    label: 'Naija',
    emoji: '🇳🇬',
    preview: { bg: '#008751', accent: '#EDE3D3', text: '#008751' },
    cssVars: {},
  },
  {
    id: 'grass_court',
    label: 'Grass Court',
    emoji: '🎾',
    preview: { bg: '#16a34a', accent: '#eab308', text: '#ffffff' },
    cssVars: {},
  },
]

export const THEME_MAP: Record<ThemeId, ThemeConfig> = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<
  ThemeId,
  ThemeConfig
>

/** All CSS custom properties that any theme may set on `:root` (for clearing on reset). */
export const ALL_THEME_CSS_VAR_KEYS = [...new Set(THEMES.flatMap((theme) => Object.keys(theme.cssVars)))]

/** Parse a raw string into a valid ThemeId, defaulting to 'default'. */
export function parseThemeId(raw: unknown): ThemeId {
  if (typeof raw === 'string' && raw in THEME_MAP) return raw as ThemeId
  return 'default'
}

/** Build a CSSProperties object from a theme's cssVars for use as inline styles. */
export function themeStyleVars(themeId: ThemeId | undefined): React.CSSProperties {
  const theme = THEME_MAP[themeId ?? 'default']
  if (!theme || Object.keys(theme.cssVars).length === 0) return {}
  return theme.cssVars as unknown as React.CSSProperties
}
