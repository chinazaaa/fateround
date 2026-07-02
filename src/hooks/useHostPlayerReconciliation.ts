// src/hooks/useHostPlayerReconciliation.ts
'use client'

import { useEffect, useRef } from 'react'

/**
 * Clears the host-as-player state when the host's own player row disappears
 * from the roster (e.g. the host was removed from another browser/device).
 *
 * Host views track the host-as-player separately (`hostPlayerId` etc.). The
 * roster (`players`) is kept fresh by realtime/polling, but nothing reconciled
 * the host-player state against it — so a "Playing as …" bar would linger after
 * the host's row was deleted elsewhere.
 *
 * Detection is "was present, now gone": we only fire `onSelfRemoved` once the
 * host's id has actually been observed in `players` and then vanishes. This
 * deliberately avoids false positives during the join flow, where `hostPlayerId`
 * is set a beat before `load()` repopulates `players`.
 *
 * @param players        Current roster (only `id` is read).
 * @param hostPlayerId   The host's own player id, or null when not playing.
 * @param onSelfRemoved  Called once when the host's row goes present -> absent.
 */
export function useHostPlayerReconciliation(
  players: { id: string }[],
  hostPlayerId: string | null,
  onSelfRemoved: () => void
) {
  const seenRef = useRef(false)
  const cbRef = useRef(onSelfRemoved)

  useEffect(() => {
    cbRef.current = onSelfRemoved
  })

  useEffect(() => {
    if (!hostPlayerId) {
      seenRef.current = false
      return
    }
    if (players.some((p) => p.id === hostPlayerId)) {
      seenRef.current = true
    } else if (seenRef.current) {
      seenRef.current = false
      cbRef.current()
    }
  }, [players, hostPlayerId])
}
