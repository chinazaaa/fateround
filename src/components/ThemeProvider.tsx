'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const stored = localStorage.getItem('kmk-theme') as Theme | null
    const resolved = stored ?? 'light'
    setTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('kmk-theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
