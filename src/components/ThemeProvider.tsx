'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { setThemeCookie, type Theme } from '@/lib/theme-cookie'

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})

export function ThemeProvider({
  children,
  initialTheme = 'light',
}: {
  children: React.ReactNode
  initialTheme?: Theme
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    const stored = localStorage.getItem('kmk-theme')
    const resolved: Theme = stored === 'dark' || stored === 'light' ? stored : initialTheme
    setTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)
    setThemeCookie(resolved)
    if (stored !== resolved) localStorage.setItem('kmk-theme', resolved)
  }, [initialTheme])

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('kmk-theme', next)
    setThemeCookie(next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
