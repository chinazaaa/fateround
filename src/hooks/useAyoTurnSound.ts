'use client'

import { useEffect, useRef } from 'react'
import type { AyoSession } from '@/types'
import { currentTurnPlayerId } from '@/lib/ayo'

export function useAyoTurnSound(session: AyoSession | null, myPlayerId: string | null, enabled: boolean) {
  const prevTurnRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !session || session.status !== 'active' || !myPlayerId) return
    const turnPlayer = currentTurnPlayerId(session)
    if (prevTurnRef.current && prevTurnRef.current !== turnPlayer && turnPlayer === myPlayerId) {
      try {
        const ctx = new AudioContext()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.value = 520
        gain.gain.value = 0.08
        osc.start()
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
        osc.stop(ctx.currentTime + 0.15)
      } catch {
        // ignore audio failures
      }
    }
    prevTurnRef.current = turnPlayer
  }, [session, myPlayerId, enabled])
}
