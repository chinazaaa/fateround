import { useEffect, useState } from 'react'
import { absoluteDeadlineSecondsLeft } from './deadline'

export function useAbsoluteDeadline(deadlineAt: string | null | undefined, active: boolean): number {
  const [seconds, setSeconds] = useState(() => (active ? absoluteDeadlineSecondsLeft(deadlineAt) : 0))

  useEffect(() => {
    if (!active || !deadlineAt) {
      setSeconds(0)
      return
    }
    const tick = () => setSeconds(absoluteDeadlineSecondsLeft(deadlineAt))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [active, deadlineAt])

  return seconds
}
