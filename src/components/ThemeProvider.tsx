'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { setThemeCookie, THEME_STORAGE_KEY, type Theme } from '@/lib/theme-cookie'

const ThemeContext = createContext<{ theme: Theme; toggle: (event?: React.MouseEvent | MouseEvent) => void }>({
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

  const toggle = (event?: React.MouseEvent | MouseEvent) => {
    const next: Theme = theme === 'light' ? 'dark' : 'light'

    const applyTheme = () => {
      document.documentElement.setAttribute('data-theme', next)
      setTheme(next)
      setThemeCookie(next)
      writeStoredTheme(next)
    }

    if (
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const x = event && 'clientX' in event && event.clientX ? event.clientX : window.innerWidth / 2
      const y = event && 'clientY' in event && event.clientY ? event.clientY : window.innerHeight / 2

      const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

      const transition = (
        document as unknown as { startViewTransition: (cb: () => void) => { ready: Promise<void> } }
      ).startViewTransition(() => {
        applyTheme()
      })

      transition.ready
        .then(() => {
          const glowColor = next === 'dark' ? 'rgba(251, 113, 133, 0.8)' : 'rgba(245, 158, 11, 0.8)'
          document.documentElement.animate(
            {
              clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
              filter: [
                `drop-shadow(0 0 45px ${glowColor}) brightness(1.25)`,
                `drop-shadow(0 0 0px transparent) brightness(1)`,
              ],
            },
            {
              duration: 650,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
              pseudoElement: '::view-transition-new(root)',
            }
          )
        })
        .catch(() => {
          /* View transition was skipped — theme already applied */
        })
    } else {
      applyTheme()
    }
  }

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
