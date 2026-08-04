'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface DailyChallengeTimerOptions {
  mode: 'countup' | 'countdown'
  maxSeconds: number
  running: boolean
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
}: DailyChallengeTimerOptions): DailyChallengeTimerResult {
  const [elapsed, setElapsed] = useState(0)
  // Seconds banked from completed running segments, plus the wall-clock start of the current one.
  // Kept in refs so the ticking effect does NOT depend on `elapsed` — depending on it tore down
  // and recreated the interval every second, which reset the start time and pinned the clock.
  const accumulatedRef = useRef(0)
  const segmentStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) return

    const bankSegment = () => {
      if (segmentStartRef.current !== null) {
        accumulatedRef.current += Math.floor((Date.now() - segmentStartRef.current) / 1000)
        segmentStartRef.current = null
      }
    }

    // Begin (or resume) a running segment.
    if (segmentStartRef.current === null) segmentStartRef.current = Date.now()

    const tick = () => {
      if (segmentStartRef.current === null) return
      const total = accumulatedRef.current + Math.floor((Date.now() - segmentStartRef.current) / 1000)
      setElapsed(mode === 'countdown' ? Math.min(total, maxSeconds) : total)
    }

    // Pause while the tab is hidden; resume on return.
    const onVisibility = () => {
      if (document.hidden) bankSegment()
      else if (segmentStartRef.current === null) segmentStartRef.current = Date.now()
    }

    const id = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', onVisibility)
    tick()

    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
      bankSegment() // preserve progress if paused via `running` (e.g. on submit)
    }
  }, [running, mode, maxSeconds])

  const remaining = Math.max(0, maxSeconds - elapsed)
  const isTimeUp = mode === 'countdown' && remaining <= 0

  return {
    elapsed,
    remaining,
    formatted: mode === 'countdown' ? formatTime(remaining) : formatTime(elapsed),
    isTimeUp,
  }
}

export function useDailyChallengeElapsed(running: boolean): {
  elapsed: number
  reset: () => void
} {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) return
    startRef.current = Date.now()
    const id = setInterval(() => {
      if (startRef.current) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  const reset = useCallback(() => {
    setElapsed(0)
    startRef.current = Date.now()
  }, [])

  return { elapsed, reset }
}
