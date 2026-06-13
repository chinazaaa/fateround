export type ThemeId = 'default' | 'neon' | 'retro' | 'elegant' | 'tropical'

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
    cssVars: {
      '--background': '#0a0a14',
      '--background-soft': '#0e0e1a',
      '--foreground': '#e0ffe0',
      '--muted': '#8cf0c0',
      '--faint': '#4a8a6a',
      '--card': 'rgba(10, 20, 30, 0.78)',
      '--card-strong': 'rgba(14, 24, 34, 0.92)',
      '--card-hover': 'rgba(20, 34, 48, 0.85)',
      '--surface-inset-bg': 'rgba(0, 255, 200, 0.04)',
      '--border': 'rgba(0, 255, 255, 0.1)',
      '--border-strong': 'rgba(0, 255, 255, 0.18)',
      '--card-shadow': '0 1px 3px rgba(0, 0, 0, 0.5), 0 4px 20px rgba(0, 229, 255, 0.08)',
      '--card-shadow-strong': '0 12px 48px rgba(0, 0, 0, 0.55), 0 0 24px rgba(0, 229, 255, 0.12)',
      '--card-shadow-glow': '0 0 0 1px rgba(0, 229, 255, 0.2), 0 8px 40px rgba(0, 229, 255, 0.15)',
      '--bg-gradient':
        'radial-gradient(ellipse 90% 55% at 50% -10%, rgba(0, 229, 255, 0.14) 0%, transparent 55%), radial-gradient(ellipse 50% 35% at 85% 90%, rgba(200, 0, 255, 0.1) 0%, transparent 50%)',
      '--primary': '#00e5ff',
      '--primary-strong': '#00bcd4',
      '--primary-glow': 'rgba(0, 229, 255, 0.4)',
      '--kiss': '#e040fb',
      '--marry': '#76ff03',
      '--kill': '#ff1744',
      '--slot-kiss-text': '#ea80fc',
      '--slot-kill-text': '#ff8a80',
      '--slot-pass-text': '#80cbc4',
      '--chip-active-text': '#b2ebf2',
      '--chip-active-bg': 'rgba(0, 229, 255, 0.12)',
      '--chip-active-border': 'rgba(0, 229, 255, 0.4)',
      '--avatar-bg': 'rgba(0, 229, 255, 0.12)',
      '--avatar-border': 'rgba(0, 229, 255, 0.25)',
      '--avatar-color': '#80deea',
      '--gradient-title-start': '#e0ffe0',
      '--gradient-title-end': '#00e5ff',
      '--modal-backdrop': 'rgba(0, 0, 0, 0.78)',
    },
  },
  {
    id: 'retro',
    label: 'Retro',
    emoji: '📺',
    preview: { bg: '#faf3e6', accent: '#d97706', text: '#3d2b1f' },
    cssVars: {
      '--background': '#faf3e6',
      '--background-soft': '#fff8ee',
      '--foreground': '#3d2b1f',
      '--muted': '#7a6352',
      '--faint': '#a99582',
      '--card': 'rgba(255, 248, 238, 0.82)',
      '--card-strong': 'rgba(255, 252, 245, 0.94)',
      '--card-hover': 'rgba(255, 245, 230, 0.9)',
      '--surface-inset-bg': 'rgba(180, 120, 60, 0.05)',
      '--border': 'rgba(180, 120, 60, 0.12)',
      '--border-strong': 'rgba(180, 120, 60, 0.2)',
      '--card-shadow': '0 1px 2px rgba(120, 80, 30, 0.06), 0 4px 16px rgba(120, 80, 30, 0.08)',
      '--card-shadow-strong': '0 8px 40px rgba(120, 80, 30, 0.12), 0 2px 8px rgba(120, 80, 30, 0.06)',
      '--card-shadow-glow': '0 0 0 1px rgba(217, 119, 6, 0.15), 0 8px 32px rgba(217, 119, 6, 0.1)',
      '--bg-gradient':
        'radial-gradient(ellipse 90% 60% at 50% -20%, rgba(217, 119, 6, 0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 90% 80%, rgba(180, 80, 20, 0.05) 0%, transparent 50%)',
      '--primary': '#d97706',
      '--primary-strong': '#b45309',
      '--primary-glow': 'rgba(217, 119, 6, 0.3)',
      '--kiss': '#ea580c',
      '--marry': '#ca8a04',
      '--kill': '#991b1b',
      '--slot-kiss-text': '#c2410c',
      '--slot-kill-text': '#7f1d1d',
      '--slot-pass-text': '#78716c',
      '--chip-active-text': '#92400e',
      '--chip-active-bg': 'rgba(217, 119, 6, 0.1)',
      '--chip-active-border': 'rgba(217, 119, 6, 0.35)',
      '--avatar-bg': 'rgba(217, 119, 6, 0.1)',
      '--avatar-border': 'rgba(217, 119, 6, 0.2)',
      '--avatar-color': '#b45309',
      '--gradient-title-start': '#3d2b1f',
      '--gradient-title-end': '#d97706',
      '--modal-backdrop': 'rgba(60, 40, 20, 0.5)',
    },
  },
  {
    id: 'elegant',
    label: 'Elegant',
    emoji: '✨',
    preview: { bg: '#0c0f1a', accent: '#d4a843', text: '#f0ead6' },
    cssVars: {
      '--background': '#0c0f1a',
      '--background-soft': '#111627',
      '--foreground': '#f0ead6',
      '--muted': '#b8a88a',
      '--faint': '#6e6350',
      '--card': 'rgba(16, 20, 36, 0.8)',
      '--card-strong': 'rgba(20, 24, 42, 0.92)',
      '--card-hover': 'rgba(26, 30, 50, 0.88)',
      '--surface-inset-bg': 'rgba(212, 168, 67, 0.04)',
      '--border': 'rgba(212, 168, 67, 0.1)',
      '--border-strong': 'rgba(212, 168, 67, 0.18)',
      '--card-shadow': '0 1px 3px rgba(0, 0, 0, 0.5), 0 4px 20px rgba(0, 0, 0, 0.3)',
      '--card-shadow-strong': '0 12px 48px rgba(0, 0, 0, 0.55), 0 0 20px rgba(212, 168, 67, 0.06)',
      '--card-shadow-glow': '0 0 0 1px rgba(212, 168, 67, 0.2), 0 8px 40px rgba(212, 168, 67, 0.1)',
      '--bg-gradient':
        'radial-gradient(ellipse 90% 55% at 50% -10%, rgba(212, 168, 67, 0.1) 0%, transparent 55%), radial-gradient(ellipse 50% 35% at 85% 90%, rgba(180, 140, 50, 0.06) 0%, transparent 50%)',
      '--primary': '#d4a843',
      '--primary-strong': '#b8922e',
      '--primary-glow': 'rgba(212, 168, 67, 0.35)',
      '--kiss': '#e5a832',
      '--marry': '#f0d060',
      '--kill': '#c53030',
      '--slot-kiss-text': '#f0c060',
      '--slot-kill-text': '#fc8181',
      '--slot-pass-text': '#a0aec0',
      '--chip-active-text': '#f0dca0',
      '--chip-active-bg': 'rgba(212, 168, 67, 0.12)',
      '--chip-active-border': 'rgba(212, 168, 67, 0.4)',
      '--avatar-bg': 'rgba(212, 168, 67, 0.12)',
      '--avatar-border': 'rgba(212, 168, 67, 0.25)',
      '--avatar-color': '#e5c76a',
      '--gradient-title-start': '#f0ead6',
      '--gradient-title-end': '#d4a843',
      '--modal-backdrop': 'rgba(6, 8, 14, 0.75)',
    },
  },
  {
    id: 'tropical',
    label: 'Tropical',
    emoji: '🌴',
    preview: { bg: '#0a1a1a', accent: '#ff6b6b', text: '#e0f7f4' },
    cssVars: {
      '--background': '#0a1a1a',
      '--background-soft': '#0f2222',
      '--foreground': '#e0f7f4',
      '--muted': '#80cbc4',
      '--faint': '#4a8a82',
      '--card': 'rgba(12, 28, 28, 0.78)',
      '--card-strong': 'rgba(16, 34, 34, 0.92)',
      '--card-hover': 'rgba(22, 42, 42, 0.88)',
      '--surface-inset-bg': 'rgba(0, 200, 180, 0.04)',
      '--border': 'rgba(0, 200, 180, 0.1)',
      '--border-strong': 'rgba(0, 200, 180, 0.18)',
      '--card-shadow': '0 1px 3px rgba(0, 0, 0, 0.5), 0 4px 20px rgba(0, 0, 0, 0.3)',
      '--card-shadow-strong': '0 12px 48px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 107, 107, 0.08)',
      '--card-shadow-glow': '0 0 0 1px rgba(255, 107, 107, 0.2), 0 8px 40px rgba(255, 107, 107, 0.12)',
      '--bg-gradient':
        'radial-gradient(ellipse 90% 55% at 50% -10%, rgba(255, 107, 107, 0.12) 0%, transparent 55%), radial-gradient(ellipse 50% 35% at 85% 90%, rgba(0, 200, 180, 0.1) 0%, transparent 50%)',
      '--primary': '#ff6b6b',
      '--primary-strong': '#e05555',
      '--primary-glow': 'rgba(255, 107, 107, 0.4)',
      '--kiss': '#ff9f43',
      '--marry': '#00d2d3',
      '--kill': '#ee5a24',
      '--slot-kiss-text': '#ffc078',
      '--slot-kill-text': '#ff8a70',
      '--slot-pass-text': '#80cbc4',
      '--chip-active-text': '#ffc0c0',
      '--chip-active-bg': 'rgba(255, 107, 107, 0.12)',
      '--chip-active-border': 'rgba(255, 107, 107, 0.4)',
      '--avatar-bg': 'rgba(255, 107, 107, 0.12)',
      '--avatar-border': 'rgba(255, 107, 107, 0.25)',
      '--avatar-color': '#ff9090',
      '--gradient-title-start': '#e0f7f4',
      '--gradient-title-end': '#ff6b6b',
      '--modal-backdrop': 'rgba(5, 12, 12, 0.75)',
    },
  },
]

export const THEME_MAP: Record<ThemeId, ThemeConfig> = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<
  ThemeId,
  ThemeConfig
>

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
