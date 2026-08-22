import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { useOnAppResume } from '@/hooks/useAppActive'

/**
 * Re-run a fetch whenever the screen comes back into view, or the app returns from the
 * background.
 *
 * WHY. Profile-derived numbers — trophy points, streak, per-game trophy counts — are written
 * SERVER-SIDE by the award pass when a game finishes. A screen that fetches them once on
 * mount therefore shows whatever was true when it first rendered and never updates: finish a
 * game, come back to Home, and the chip still reads the old 🏆 count. Because Expo keeps the
 * mounted screen alive, the only thing that ever fixed it was force-quitting the app, which is
 * exactly how this was reported.
 *
 * Two triggers, because they cover different halves of the problem:
 *   - `useFocusEffect` — navigating back to a screen that stayed mounted underneath (the
 *     common case: play a game → back to Home).
 *   - `useOnAppResume` — the screen never lost focus but the app was backgrounded, so time
 *     passed and the server may have moved on. `useFocusEffect` does not fire for this.
 *
 * Both are edges, not polls: nothing runs on a timer, so a screen sitting open costs nothing.
 * `fetcher` is held in a ref, so an inline arrow at the call site doesn't re-subscribe on
 * every render.
 *
 * Must be called from inside a navigator screen — `useFocusEffect` needs navigation context.
 * Every current caller is a route or a component rendered by one.
 */
export function useRefreshOnFocus(fetcher: () => void | Promise<void>): void {
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  // useFocusEffect runs on first focus too, so this covers the initial load as well —
  // callers do not need a separate mount effect.
  useFocusEffect(
    useCallback(() => {
      void fetcherRef.current()
    }, [])
  )

  useOnAppResume(() => {
    void fetcherRef.current()
  })
}
