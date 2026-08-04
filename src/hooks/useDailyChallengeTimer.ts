'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface DailyChallengeTimerOptions {
  mode: 'countup' | 'countdown'
  maxSeconds: number
  running: boolean
  /**
   * Epoch-ms the attempt started. When provided (from persisted daily progress), the clock is pure
   * wall-clock from that instant, so it keeps running across reloads / navigation instead of
   * resetting. Omit to start from mount.
   */
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
  // Wall-clock from a fixed start instant. `startAtMs` (persisted) keeps the clock honest across
  // reloads; without it we capture mount time once. Kept in a ref so the interval isn't torn down
  // and recreated each tick (which would reset the start and pin the clock).
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
