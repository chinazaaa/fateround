import { useEffect, useRef } from 'react'
import { playTickTockSound, TIMER_TICK_THRESHOLD } from '@/lib/sounds'

/** Plays a tick-tock each second when the countdown enters the final seconds. */
export function useTimerTickSound(seconds: number, enabled: boolean, threshold: number = TIMER_TICK_THRESHOLD) {
  const lastTickRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      lastTickRef.current = null
      return
    }
    if (seconds <= 0 || seconds > threshold) {
      if (seconds > threshold) lastTickRef.current = null
      return
    }
    if (lastTickRef.current === seconds) return
    lastTickRef.current = seconds
    playTickTockSound(seconds, threshold)
  }, [seconds, enabled, threshold])
}
