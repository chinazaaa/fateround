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
  const startTimeRef = useRef<number | null>(null)
  const pausedElapsedRef = useRef(0)

  useEffect(() => {
    if (!running) {
      if (startTimeRef.current !== null) {
        pausedElapsedRef.current = elapsed
        startTimeRef.current = null
      }
      return
    }

    startTimeRef.current = Date.now()
    const baseElapsed = pausedElapsedRef.current

    const tick = () => {
      if (!startTimeRef.current) return
      const delta = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const total = baseElapsed + delta
      setElapsed(mode === 'countdown' ? Math.min(total, maxSeconds) : total)
    }

    const id = setInterval(tick, 1000)
    tick()

    return () => clearInterval(id)
  }, [running, mode, maxSeconds, elapsed])

  // Pause on tab visibility change
  useEffect(() => {
    if (!running) return
    const handler = () => {
      if (document.hidden) {
        pausedElapsedRef.current = elapsed
        startTimeRef.current = null
      } else if (startTimeRef.current === null) {
        startTimeRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [running, elapsed])

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
