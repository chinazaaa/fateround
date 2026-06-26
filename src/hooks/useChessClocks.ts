'use client'

import { useEffect, useRef } from 'react'
import type { ChessSession } from '@/types'

/**
 * Watches the active player's cumulative clock and reports a flag-fall to the
 * server when it hits zero. Implemented with refs and a 1s interval so it never
 * calls setState — it does NOT re-render the board. The visible clocks tick in
 * their own isolated <ChessClockChip> components, keeping moves smooth and the
 * countdown from stuttering under render load. The server re-checks the deadline,
 * so a slightly-early/late client tick is harmless.
 */
export function useChessClockExpiry(gameCode: string, session: ChessSession | null, enabled: boolean) {
  const sessionRef = useRef(session)
  sessionRef.current = session
  const expiringRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      const s = sessionRef.current
      if (!s || s.status !== 'active') return
      if (s.white_time_ms == null || s.black_time_ms == null || !s.turn_started_at) return
      const base = s.current_turn === 'w' ? s.white_time_ms : s.black_time_ms
      const remaining = Math.max(0, base - Math.max(0, Date.now() - Date.parse(s.turn_started_at)))
      if (remaining <= 0 && !expiringRef.current) {
        expiringRef.current = true
        void fetch('/api/chess/expire-turn', {
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
