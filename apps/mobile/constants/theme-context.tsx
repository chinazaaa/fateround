import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'
import type { StyleSheet } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { parseThemeId } from '@fateround/shared/create-themes'
import { darkTheme, lightTheme, type Theme } from '@/constants/theme'
import { GAME_THEME_OVERRIDES } from '@/constants/game-themes'

/** What the user picked. `system` defers to the phone's light/dark setting. */
export type ThemeMode = 'system' | 'light' | 'dark'
/** The scheme actually being rendered once `system` is resolved. */
export type ResolvedScheme = 'light' | 'dark'

const STORAGE_KEY = 'fateround_theme_mode'

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

type ThemeContextValue = {
  theme: Theme
  /** User preference: system | light | dark. */
  mode: ThemeMode
  /** Scheme currently on screen: light | dark. */
  scheme: ResolvedScheme
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // `null` while the phone hasn't reported a scheme yet — treat as dark, the
  // app's historical default, so there's no light flash on cold start.
  const systemScheme = useColorScheme()
  const [mode, setModeState] = useState<ThemeMode>('system')

  // Load the saved preference once. SecureStore is async, so we start on
  // `system` and adopt the stored value when it arrives.
  useEffect(() => {
    let active = true
    void SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (active && isThemeMode(stored)) setModeState(stored)
      })
      .catch(() => {
        // No stored preference (or SecureStore unavailable) — stay on `system`.
      })
    return () => {
      active = false
    }
  }, [])

  const setMode = useMemo(
    () => (next: ThemeMode) => {
      setModeState(next)
      void SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {
        // Persisting the preference is best-effort; ignore write failures.
      })
    },
    []
  )

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ResolvedScheme =
      mode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : mode
    return {
      theme: scheme === 'light' ? lightTheme : darkTheme,
      mode,
      scheme,
      setMode,
    }
  }, [mode, systemScheme, setMode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}

/** Current theme tokens. Use for inline colours in JSX (props, dynamic styles). */
export function useTheme(): Theme {
  return useThemeContext().theme
}

/** Preference + resolved scheme + setter, for the theme toggle UI. */
export function useThemeMode(): {
  mode: ThemeMode
  scheme: ResolvedScheme
  setMode: (mode: ThemeMode) => void
} {
  const { mode, scheme, setMode } = useThemeContext()
  return { mode, scheme, setMode }
}

/**
 * Turn a stylesheet factory into a themed StyleSheet, recomputed only when the
 * scheme flips. Define the factory at module scope and name its parameter
 * `theme` so the body reads exactly like the old static StyleSheet.create:
 *
 *   const makeStyles = (theme: Theme) => StyleSheet.create({ ... theme.bg ... })
 *   // inside the component:
 *   const styles = useThemedStyles(makeStyles)
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T
): T {
  const theme = useTheme()
  return useMemo(() => factory(theme), [factory, theme])
}

/**
 * Applies a per-game visual theme (Neon / Retro / Elegant / Tropical — the
 * `game.theme` "edition" picked in create + lobby settings) to everything it
 * wraps. It nests over the app's light/dark context, merging the theme's palette
 * overrides onto the base tokens, so every tokenized game screen recolors with no
 * per-screen changes. `default` (and unknown/finished) passes the base theme
 * through untouched.
 */
export function GameThemeProvider({
  theme: themeValue,
  children,
}: {
  /** Raw `game.theme` value (or `'default'` to reset, e.g. on finish). */
  theme: string | null | undefined
  children: React.ReactNode
}) {
  const parent = useThemeContext()

  const value = useMemo<ThemeContextValue>(() => {
    const overrides = GAME_THEME_OVERRIDES[parseThemeId(themeValue)]
    if (!overrides) return parent
    return { ...parent, theme: { ...parent.theme, ...overrides } }
  }, [parent, themeValue])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
