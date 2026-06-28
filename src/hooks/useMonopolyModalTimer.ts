'use client'

import { useEffect, useRef, useState } from 'react'
import { secondsUntil } from '@/lib/timer-format'

/** Fixed-length countdown; resets whenever `enabled` becomes true. */
export function useMonopolyFixedTimer(seconds: number, enabled: boolean, onExpire: () => void): number {
  const [left, setLeft] = useState(seconds)
  const expiredRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      expiredRef.current = false
      setLeft(seconds)
      return
    }

    expiredRef.current = false
    const started = Date.now()
    const tick = () => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000))
      setLeft(remaining)
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpire()
      }
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [enabled, seconds, onExpire])

  return enabled ? left : 0
}

/** Countdown to a server deadline (e.g. auction bid window). */
export function useMonopolyDeadlineTimer(
  deadlineAt: string | null | undefined,
  enabled: boolean,
  onExpire: () => void
): number {
  const [left, setLeft] = useState(0)
  const expiredRef = useRef(false)

  useEffect(() => {
    if (!enabled || !deadlineAt) {
      expiredRef.current = false
      setLeft(0)
      return
    }

    expiredRef.current = false
    const tick = () => {
      const remaining = secondsUntil(deadlineAt)
      setLeft(remaining)
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpire()
      }
    }

    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [deadlineAt, enabled, onExpire])

  return enabled && deadlineAt ? left : 0
}
