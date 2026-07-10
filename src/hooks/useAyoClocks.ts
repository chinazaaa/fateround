'use client'

import { useEffect, useRef } from 'react'
import type { AyoSession } from '@/types'

export function useAyoClockExpiry(gameCode: string, session: AyoSession | null, enabled: boolean) {
  const sessionRef = useRef(session)
  sessionRef.current = session
  const expiringRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      const s = sessionRef.current
      if (!s || s.status !== 'active') return
      if (s.a_time_ms == null || s.b_time_ms == null || !s.turn_started_at) return
      const base = s.current_turn === 'a' ? s.a_time_ms : s.b_time_ms
      const remaining = Math.max(0, base - Math.max(0, Date.now() - Date.parse(s.turn_started_at)))
      if (remaining <= 0 && !expiringRef.current) {
        expiringRef.current = true
        void fetch('/api/ayo/expire-turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode }),
        }).finally(() => {
          window.setTimeout(() => {
            expiringRef.current = false
          }, 3000)
        })
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [enabled, gameCode])
}
