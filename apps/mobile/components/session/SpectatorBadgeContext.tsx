import { createContext, useContext, useEffect } from 'react'

/**
 * Lets a game view tell the session header that the current player is watching
 * as a spectator, so the header can show a compact "Watching" pill next to the
 * game-type pill — mirroring the host badge — instead of the game body carrying
 * a full spectator banner. The provider lives in `PlayerSessionShell`, which
 * owns the state and renders the pill.
 */
export const SpectatorBadgeContext = createContext<((active: boolean) => void) | null>(null)

/**
 * Flag the header spectator pill for as long as the calling component is mounted
 * with `active` true. Safe to call unconditionally (hook rules) — pass the
 * viewer boolean and it toggles as game/player state changes.
 */
export function useSpectatorBadge(active: boolean) {
  const setActive = useContext(SpectatorBadgeContext)
  useEffect(() => {
    if (!setActive) return
    setActive(active)
    return () => setActive(false)
  }, [active, setActive])
}
