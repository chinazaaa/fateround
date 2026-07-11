import { useEffect, useState } from 'react'
import { secondsUntilDeadline } from '@fateround/shared/round-timing'

export function useDeadlineCountdown(
  anchorTime: string | null | undefined,
  delaySeconds: number,
  active: boolean
): number {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    active ? secondsUntilDeadline(anchorTime, delaySeconds) : 0
  )

  useEffect(() => {
    if (!active) {
      setSecondsLeft(0)
      return
    }

    const tick = () => setSecondsLeft(secondsUntilDeadline(anchorTime, delaySeconds))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [anchorTime, delaySeconds, active])

  return secondsLeft
}
