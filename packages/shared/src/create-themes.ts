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

export type CreateThemeOption = {
  id: ThemeId
  label: string
  emoji: string
}

export const CREATE_THEMES: CreateThemeOption[] = [
  { id: 'default', label: 'Default', emoji: '🎲' },
  { id: 'neon', label: 'Neon', emoji: '💡' },
  { id: 'retro', label: 'Retro', emoji: '📺' },
  { id: 'elegant', label: 'Elegant', emoji: '✨' },
  { id: 'tropical', label: 'Tropical', emoji: '🌴' },
  { id: 'pirate', label: 'Pirate', emoji: '🏴‍☠️' },
  { id: 'arctic', label: 'Arctic', emoji: '🧭' },
  { id: 'naija', label: 'Naija', emoji: '🇳🇬' },
]

export const MONOPOLY_EDITION_THEMES: CreateThemeOption[] = [
  { id: 'default', label: 'Classic', emoji: '🎩' },
  { id: 'pirate', label: 'Pirate', emoji: '🏴‍☠️' },
  { id: 'arctic', label: 'Arctic', emoji: '🧭' },
  { id: 'naija', label: 'Naija', emoji: '🇳🇬' },
]

export function parseThemeId(raw: unknown): ThemeId {
  if (typeof raw === 'string' && CREATE_THEMES.some((theme) => theme.id === raw)) {
    return raw as ThemeId
  }
  return 'default'
}

export function themesForGameType(gameType: string): CreateThemeOption[] {
  if (gameType === 'monopoly') return MONOPOLY_EDITION_THEMES
  return CREATE_THEMES.filter((theme) => theme.id !== 'pirate' && theme.id !== 'arctic' && theme.id !== 'naija')
}
