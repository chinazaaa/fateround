'use client'

import { useEffect } from 'react'
import { ANONYMOUS_ROOM_TRIM_INTERVAL_MS } from '@/lib/anonymous-messages'

export function useAnonymousMessageTrim(gameCode: string, active: boolean) {
  useEffect(() => {
    if (!active) return

    const trim = () => {
      void fetch('/api/anonymous-messages/trim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode }),
      })
    }

    trim()
    const id = window.setInterval(trim, ANONYMOUS_ROOM_TRIM_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [active, gameCode])
}
