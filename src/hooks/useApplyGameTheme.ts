'use client'

import { useEffect } from 'react'
import { parseThemeId } from '@/lib/themes'

interface GameThemeClaim {
  themeId: string
  gameType: string | null
}

/**
 * Every mounted caller, in the order their effects ran. Screens overlap: a host view renders the
 * player view inside itself, and both call this hook. With a single set/clear per caller, the one
 * that unmounted first stripped the attributes the other still needed — which is why the host's
 * theme reverted to the default after "play again" until the page was refreshed. Keeping the claims
 * lets the document follow the newest one that is still mounted.
 */
const gameThemeClaims: GameThemeClaim[] = []

function syncDocumentTheme(): void {
  const root = document.documentElement
  const claim = gameThemeClaims[gameThemeClaims.length - 1]

  if (!claim) {
    root.removeAttribute('data-game-theme')
    root.removeAttribute('data-game-type')
    return
  }

  if (claim.gameType) {
    root.setAttribute('data-game-type', claim.gameType)
  } else {
    root.removeAttribute('data-game-type')
  }

  if (claim.themeId === 'default' || claim.themeId === 'dark') {
    root.removeAttribute('data-game-theme')
  } else {
    root.setAttribute('data-game-theme', claim.themeId)
  }
}

/**
 * Apply the selected game theme to the document root.
 *
 * Every theme's palette (light + dark variants) lives in globals.css under
 * `[data-game-theme='<id>']`, so all this does is set/clear the attribute and
 * let CSS resolve the correct colors for the active `data-theme` (light/dark).
 * No inline CSS variables are written — inline styles on `<html>` would beat
 * the `[data-theme='dark']` rules and break dark mode for themed games.
 *
 * When several mounted components ask for a theme, the most recent claim wins. React runs child
 * effects before parent effects, so a parent screen still overrides the child it renders, and a
 * child whose theme changes later takes over from that point — the behaviour callers already had.
 */
export function useApplyGameTheme(theme: string | null | undefined, gameType?: string | null) {
  useEffect(() => {
    const claim: GameThemeClaim = { themeId: parseThemeId(theme), gameType: gameType ?? null }
    gameThemeClaims.push(claim)
    syncDocumentTheme()

    return () => {
      const claimIndex = gameThemeClaims.indexOf(claim)
      if (claimIndex !== -1) {
        gameThemeClaims.splice(claimIndex, 1)
      }
      syncDocumentTheme()
    }
  }, [theme, gameType])
}
