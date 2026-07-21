'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Lets an in-game view push game-specific controls into the main chrome's single
 * ⚙ settings sheet ({@link GameChromeSettings}) — the same sheet that lives in the
 * fixed top header beside Share. Card-table games (Whot) use this to fold what
 * used to be a separate in-room header (host game settings, edit name, end game)
 * behind the one header gear, mirroring the mobile app's host settings sheet.
 *
 * The view registers a ready-built node via {@link useRegisterGameSettings};
 * {@link GameChromeSettings} renders it inside the sheet while it's mounted.
 *
 * `register` lives in its own context (a stable identity) so the *registering*
 * view never re-renders when the content changes — only the *consuming* chrome
 * does. This avoids a set-state feedback loop when the registered node is rebuilt.
 */
type Register = (node: ReactNode | null) => void

const RegisterContext = createContext<Register | null>(null)
const ContentContext = createContext<ReactNode | null>(null)
const CloseContext = createContext<(() => void) | null>(null)

export function GameSettingsProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode | null>(null)
  // Stable identity across renders — registering views depend on this, not content.
  const registerRef = useRef<Register>((node) => setContent(node))
  return (
    <RegisterContext.Provider value={registerRef.current}>
      <ContentContext.Provider value={content}>{children}</ContentContext.Provider>
    </RegisterContext.Provider>
  )
}

/** Read the registered settings node — the chrome's ⚙ sheet consumes this. */
export function useGameSettingsContent(): ReactNode | null {
  return useContext(ContentContext)
}

/**
 * Provides a "close the ⚙ settings sheet" callback to whatever the sheet renders
 * (the registered node included). The chrome ({@link GameChromeSettings}) wraps the
 * sheet contents in this so an action inside — e.g. End game — can dismiss the sheet
 * after it runs.
 */
export const GameSettingsCloseProvider = CloseContext.Provider

/** Close the enclosing ⚙ settings sheet. No-op outside the sheet. */
export function useCloseGameSettings(): () => void {
  const close = useContext(CloseContext)
  return close ?? (() => {})
}

/**
 * Register a settings node for as long as the caller is mounted. Pass a memoised
 * node so the registering effect only re-runs when the content actually changes.
 * Pass `null` to contribute nothing (the sheet falls back to its default rows).
 */
export function useRegisterGameSettings(node: ReactNode | null) {
  const register = useContext(RegisterContext)
  useEffect(() => {
    if (!register) return
    register(node)
    return () => register(null)
  }, [register, node])
}
