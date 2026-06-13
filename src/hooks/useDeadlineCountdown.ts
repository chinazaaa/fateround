'use client'

import { useEffect, useState } from 'react'
import { secondsUntilDeadline } from '@/lib/round-timing'

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
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [anchorTime, delaySeconds, active])

  return secondsLeft
}
