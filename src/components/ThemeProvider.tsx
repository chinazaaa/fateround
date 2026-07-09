'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { setThemeCookie, THEME_STORAGE_KEY, type Theme } from '@/lib/theme-cookie'

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})

/**
 * Read the stored theme. localStorage access can throw when storage is blocked
 * (e.g. Microsoft Edge tracking prevention or InPrivate windows), so we swallow
 * the error and fall back to the SSR-provided theme instead of crashing.
 */
function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : null
  } catch {
    return null
  }
}

/** Persist the theme, ignoring failures from blocked storage. */
function writeStoredTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* storage blocked (Edge tracking prevention / InPrivate) — non-fatal */
  }
}

function readDomTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const stored = readStoredTheme()
    const resolved: Theme = stored ?? readDomTheme()
    setTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)
    setThemeCookie(resolved)
    if (stored !== resolved) writeStoredTheme(resolved)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    // Apply the visible change first so the UI still switches even if storage
    // or cookie writes are blocked by the browser (e.g. Edge tracking prevention).
    document.documentElement.setAttribute('data-theme', next)
    setTheme(next)
    setThemeCookie(next)
    writeStoredTheme(next)
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
