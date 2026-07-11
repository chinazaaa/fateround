import { useEffect, useRef } from 'react'
import type { Player } from '@fateround/shared'

/**
 * "Was present, now gone" detector. Mirrors web `useHostPlayerReconciliation`:
 * fires `onSelfRemoved` once when the host's own player row disappears from the
 * roster (e.g. removed from another device), without false-firing before join.
 */
export function useHostPlayerReconciliation(
  players: Player[],
  hostPlayerId: string | null,
  onSelfRemoved: () => void
) {
  const seenRef = useRef(false)

  useEffect(() => {
    if (!hostPlayerId) {
      seenRef.current = false
      return
    }
    const present = players.some((p) => p.id === hostPlayerId)
    if (present) {
      seenRef.current = true
      return
    }
    if (seenRef.current) {
      seenRef.current = false
      onSelfRemoved()
    }
  }, [players, hostPlayerId, onSelfRemoved])
}
