import { useEffect, useState } from 'react'

export function useTurnDeadlineSeconds(
  secondsLeftFn: (deadlineAt: string | null | undefined) => number,
  deadlineAt: string | null | undefined,
  active: boolean
): number {
  const [seconds, setSeconds] = useState(() => (active ? secondsLeftFn(deadlineAt) : 0))

  useEffect(() => {
    if (!active || !deadlineAt) {
      setSeconds(0)
      return
    }
    const tick = () => setSeconds(secondsLeftFn(deadlineAt))
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [active, deadlineAt, secondsLeftFn])

  return seconds
}
