import { createContext, useContext, type ReactNode } from 'react'

/**
 * Present when a player view is rendered inside the host's own screen (the
 * "Play" surface of HostChrome). Carries the host credentials so shared player
 * components — notably the finish screen — can render host-only controls
 * (play again, return to lobby) inline instead of a player-facing hint.
 */
export type HostViewValue = {
  hostToken: string
  hostPlayerId: string | null
  onReload: () => void
}

const HostViewContext = createContext<HostViewValue | null>(null)

export function HostViewProvider({ value, children }: { value: HostViewValue; children: ReactNode }) {
  return <HostViewContext.Provider value={value}>{children}</HostViewContext.Provider>
}

export function useHostView(): HostViewValue | null {
  return useContext(HostViewContext)
}

export function useIsHostView(): boolean {
  return useContext(HostViewContext) != null
}
