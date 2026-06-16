'use client'

import { useEffect, useRef } from 'react'
import { playLobbyOpenSound } from '@/lib/sounds'
import type { GameStatus } from '@/types'

/**
 * Plays a chime when the game returns to the lobby (play again / host reset).
 * Calls onOpen so the UI can switch to the join screen automatically.
 */
export function useLobbyOpenNotification(
  status: GameStatus | undefined | null,
  onOpen?: () => void
): void {
  const prevRef = useRef<GameStatus | null | undefined>(undefined)
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = status ?? null

    if (prev === undefined) return
    if (!prev || prev === 'waiting') return
    if (status !== 'waiting') return

    playLobbyOpenSound()
    onOpenRef.current?.()
  }, [status])
}
