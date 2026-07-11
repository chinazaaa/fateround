import { createContext, useContext, useEffect } from 'react'

/**
 * Lets a game player view surface a short mode/phase label (e.g. "Individual",
 * "Team Red") in the session header — the row with the code + game-type pill —
 * instead of as a floating subtitle line in the body. The provider lives in
 * `PlayerSessionShell`, which owns the state and renders the badge.
 */
export const HeaderBadgeContext = createContext<((label: string | null) => void) | null>(null)

/**
 * Register a header badge for as long as the calling component is mounted. Pass
 * `null` to show nothing. Safe to call unconditionally (hook rules) — the label
 * can be computed from game state and toggled per phase.
 */
export function useHeaderBadge(label: string | null) {
  const setBadge = useContext(HeaderBadgeContext)
  useEffect(() => {
    if (!setBadge) return
    setBadge(label)
    return () => setBadge(null)
  }, [label, setBadge])
}
