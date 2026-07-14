import { useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

/**
 * Tracks whether the app is in the foreground (`active`) vs backgrounded
 * (`background`/`inactive`). React Native suspends JS timers and lets the OS
 * tear down network sockets while backgrounded, so long-lived pollers and
 * realtime subscriptions go stale the moment the user leaves the app.
 *
 * `active` is true whenever `AppState.currentState === 'active'`. On iOS the
 * transient `inactive` state (control center, incoming call, app switcher) is
 * treated as not-active so we don't keep hammering the network mid-transition;
 * the resume path re-runs when it settles back to `active`.
 */
export function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState === 'active')

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      setActive(state === 'active')
    })
    return () => sub.remove()
  }, [])

  return active
}

/**
 * Fires `onResume` each time the app transitions back to the foreground
 * (`active`), i.e. a background/inactive → active edge. Does not fire on the
 * initial mount. Use to reconcile state that may have gone stale while
 * backgrounded (resubscribe realtime, force a reload, poll once).
 */
export function useOnAppResume(onResume: () => void): void {
  const onResumeRef = useRef(onResume)
  onResumeRef.current = onResume

  useEffect(() => {
    let prev = AppState.currentState
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      const wasBackground = prev !== 'active'
      prev = state
      if (wasBackground && state === 'active') onResumeRef.current()
    })
    return () => sub.remove()
  }, [])
}
