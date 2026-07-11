import { useEffect, useRef } from 'react'
import type { Player } from '@fateround/shared'
import { postPlayerReady } from '@/lib/game-api'
import { getPlayerSession } from '@/lib/secure-session'

/**
 * Keeps the host's own seat "ready" when the lobby reopens after Play Again.
 * Mirrors web `useHostAutoReady`: while waiting, if the host's player row got
 * reset to a spectator, re-mark it ready using the stored resume token.
 */
export function useHostAutoReady(
  gameCode: string,
  gameStatus: string | undefined,
  hostPlayerId: string | null,
  players: Player[],
  onReload?: () => void
) {
  const armedRef = useRef(false)

  useEffect(() => {
    if (gameStatus !== 'waiting' || !hostPlayerId) {
      armedRef.current = false
      return
    }
    const row = players.find((p) => p.id === hostPlayerId)
    // Row is present and already seated (ready) — re-arm for the next replay.
    if (row && row.spectator !== true) {
      armedRef.current = false
      return
    }
    if (!row || armedRef.current) return

    armedRef.current = true
    void (async () => {
      const session = await getPlayerSession(gameCode)
      if (!session?.resumeToken) return
      try {
        await postPlayerReady(gameCode, session.resumeToken, true)
        onReload?.()
      } catch {
        // best-effort; the host can still tap Play again manually
      }
    })()
  }, [gameCode, gameStatus, hostPlayerId, players, onReload])
}
