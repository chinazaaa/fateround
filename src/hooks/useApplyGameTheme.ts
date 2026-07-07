'use client'

import { useEffect } from 'react'
import { ALL_THEME_CSS_VAR_KEYS, parseThemeId, THEME_MAP } from '@/lib/themes'

function clearThemeVars(root: HTMLElement) {
  ALL_THEME_CSS_VAR_KEYS.forEach((k) => root.style.removeProperty(k))
  root.style.removeProperty('background')
}

/** Apply the selected game theme CSS variables to the document root. */
export function useApplyGameTheme(theme: string | null | undefined) {
  useEffect(() => {
    const themeId = parseThemeId(theme)
    const vars = THEME_MAP[themeId]?.cssVars ?? {}
    const root = document.documentElement

    clearThemeVars(root)

    if (themeId === 'default') {
      root.removeAttribute('data-game-theme')
      return () => {
        clearThemeVars(root)
        root.removeAttribute('data-game-theme')
      }
    }

    root.setAttribute('data-game-theme', themeId)

    if (themeId === 'pirate' || themeId === 'arctic') {
      // For Pirate and Arctic themes, styles are defined in globals.css under data-game-theme
      // to support both Light and Dark modes without inline style interference.
      return () => {
        root.removeAttribute('data-game-theme')
        clearThemeVars(root)
      }
    }

    const keys = Object.keys(vars)
    keys.forEach((k) => root.style.setProperty(k, vars[k]))
    root.style.setProperty('background', vars['--background'] ?? '')
    return () => {
      root.removeAttribute('data-game-theme')
      keys.forEach((k) => root.style.removeProperty(k))
      root.style.removeProperty('background')
    }
  }, [theme])
}
