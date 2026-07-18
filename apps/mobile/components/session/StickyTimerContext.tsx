import { createContext, useContext, useEffect, useMemo, type DependencyList, type ReactNode } from 'react'

/**
 * Lets a game view hand its timer bar/badge to the session shell so it renders
 * pinned just below the header — always visible instead of scrolling away with
 * the game body. The provider lives in `PlayerSessionShell`, which owns the
 * state and renders the pinned slot.
 */
export const StickyTimerContext = createContext<((node: ReactNode) => void) | null>(null)

/**
 * Pin a timer in the session header slot for as long as the calling component is
 * mounted. Pass the timer element (or `null` to show nothing) plus the deps it
 * derives from — the node is memoized on those deps, so the shell only re-renders
 * when the timer actually changes (e.g. once per second), not on every keystroke.
 *
 * Call unconditionally (hook rules); gate visibility by passing `null`.
 *
 * Returns `true` when a pinned slot exists (the player session shell). Under a
 * shell that has no slot (e.g. a play-first host screen) it returns `false`, and
 * the caller should render the timer inline as before:
 *   const timer = active ? <TimerBadge seconds={s} /> : null
 *   const pinned = useStickyTimer(timer, [active, s])
 *   // ...later, in the scroll body: {pinned ? null : timer}
 */
export function useStickyTimer(node: ReactNode, deps: DependencyList): boolean {
  const setTimer = useContext(StickyTimerContext)
  // Memoize on the caller's deps so an unchanged timer doesn't churn shell state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memo = useMemo(() => node, deps)
  useEffect(() => {
    if (!setTimer) return
    setTimer(memo)
    return () => setTimer(null)
  }, [memo, setTimer])
  return setTimer != null
}
