import { useCallback, useState } from 'react'
import { postPlayerPromote } from '@/lib/game-api'
import { getPlayerSession } from '@/lib/secure-session'

export function usePromoteToPlayer(
  gameCode: string,
  playerId: string | null | undefined,
  onPromoted?: () => void | Promise<unknown>
) {
  const [promoting, setPromoting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const promote = useCallback(async () => {
    if (!playerId || promoting) return
    const session = await getPlayerSession(gameCode)
    if (!session?.resumeToken) {
      setError('Your player session expired — rejoin to continue')
      return
    }

    setPromoting(true)
    setError(null)
    try {
      await postPlayerPromote(gameCode, session.resumeToken)
      await onPromoted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join as player')
    } finally {
      setPromoting(false)
    }
  }, [gameCode, onPromoted, playerId, promoting])

  return { promote, promoting, error }
}
