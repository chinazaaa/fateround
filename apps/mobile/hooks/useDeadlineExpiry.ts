import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { msUntilDeadline } from '@fateround/shared/round-timing'

/**
 * Fires `onExpire` once, at an absolute deadline (`anchorTime + delaySeconds`),
 * via a single timeout instead of a 2Hz countdown tick — for parents that only
 * need the expiry edge, not a live second-by-second value (M1). Re-checks on app
 * resume so a deadline that elapsed while backgrounded still fires. The timer
 * re-arms whenever the anchor/delay/active inputs change.
 */
export function useDeadlineExpiry(
  anchorTime: string | null | undefined,
  delaySeconds: number,
  active: boolean,
  onExpire: () => void
) {
  const onExpireRef = useRef(onExpire)
  useEffect(() => {
    onExpireRef.current = onExpire
  })

  useEffect(() => {
    if (!active || !anchorTime) return
    let fired = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      if (fired) return
      const ms = msUntilDeadline(anchorTime, delaySeconds)
      if (ms <= 0) {
        fired = true
        onExpireRef.current()
        return
      }
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        fired = true
        onExpireRef.current()
      }, ms)
    }
    arm()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') arm()
    })
    return () => {
      clearTimeout(timeoutId)
      sub.remove()
    }
  }, [anchorTime, delaySeconds, active])
}
