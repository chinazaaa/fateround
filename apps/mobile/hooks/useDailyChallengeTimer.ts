/**
 * Countdown / countup timer for the daily challenge play surfaces. Mobile
 * mirror of `src/hooks/useDailyChallengeTimer.ts`.
 *
 * When `startAtMs` is provided (from persisted progress) the clock is pure
 * wall-clock from that instant, so it keeps running across app relaunches
 * instead of resetting.
 */

import { useEffect, useRef, useState } from 'react'

interface DailyChallengeTimerOptions {
  mode: 'countup' | 'countdown'
  maxSeconds: number
  running: boolean
  startAtMs?: number
}

interface DailyChallengeTimerResult {
  elapsed: number
  remaining: number
  formatted: string
  isTimeUp: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function useDailyChallengeTimer({
  mode,
  maxSeconds,
  running,
  startAtMs,
}: DailyChallengeTimerOptions): DailyChallengeTimerResult {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(startAtMs ?? null)

  useEffect(() => {
    if (!running) return

    if (startAtMs != null) startRef.current = startAtMs
    else if (startRef.current === null) startRef.current = Date.now()

    const tick = () => {
      const start = startRef.current
      if (start === null) return
      const total = Math.max(0, Math.floor((Date.now() - start) / 1000))
      setElapsed(mode === 'countdown' ? Math.min(total, maxSeconds) : total)
    }

    const id = setInterval(tick, 1000)
    tick()

    return () => clearInterval(id)
  }, [running, mode, maxSeconds, startAtMs])

  const remaining = Math.max(0, maxSeconds - elapsed)
  const isTimeUp = mode === 'countdown' && remaining <= 0

  return {
    elapsed,
    remaining,
    formatted: mode === 'countdown' ? formatTime(remaining) : formatTime(elapsed),
    isTimeUp,
  }
}
