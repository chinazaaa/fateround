'use client'

import { useEffect } from 'react'
import { parseThemeId } from '@/lib/themes'

/**
 * Apply the selected game theme to the document root.
 *
 * Every theme's palette (light + dark variants) lives in globals.css under
 * `[data-game-theme='<id>']`, so all this does is set/clear the attribute and
 * let CSS resolve the correct colors for the active `data-theme` (light/dark).
 * No inline CSS variables are written — inline styles on `<html>` would beat
 * the `[data-theme='dark']` rules and break dark mode for themed games.
 */
export function useApplyGameTheme(theme: string | null | undefined, gameType?: string | null) {
  useEffect(() => {
    const themeId = parseThemeId(theme)
    const root = document.documentElement

    if (gameType) {
      root.setAttribute('data-game-type', gameType)
    } else {
      root.removeAttribute('data-game-type')
    }

    if (themeId === 'default') {
      root.removeAttribute('data-game-theme')
    } else {
      root.setAttribute('data-game-theme', themeId)
    }

    return () => {
      root.removeAttribute('data-game-theme')
      root.removeAttribute('data-game-type')
    }
  }, [theme, gameType])
}
