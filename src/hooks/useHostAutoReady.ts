'use client'

import { useEffect, useRef } from 'react'
import { markPlayerReady } from '@/lib/player-ready'
import { getPlayerSession } from '@/lib/utils'
import type { GameStatus, Player } from '@/types'

/** Keeps the host-player ready when the lobby reopens after play again. */
export function useHostAutoReady(
  gameCode: string,
  gameStatus: GameStatus | undefined,
  hostPlayerId: string | null,
  players: Pick<Player, 'id' | 'spectator'>[],
  onReload?: () => void | Promise<unknown>
): void {
  const onReloadRef = useRef(onReload)
  onReloadRef.current = onReload

  useEffect(() => {
    if (gameStatus !== 'waiting' || !hostPlayerId) return
    const host = players.find((p) => p.id === hostPlayerId)
    if (host?.spectator !== true) return

    const resumeToken = getPlayerSession(gameCode)?.resumeToken
    if (!resumeToken) return

    void (async () => {
      await markPlayerReady(gameCode, resumeToken)
      await onReloadRef.current?.()
    })()
  }, [gameCode, gameStatus, hostPlayerId, players])
}
