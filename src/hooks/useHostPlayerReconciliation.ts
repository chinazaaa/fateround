// src/hooks/useHostPlayerReconciliation.ts
'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/** Probe whether the host's player row is really gone.
 *  - `true`  — the server positively reports no such row.
 *  - `false` — it still exists, OR the check was unverifiable (permission denied,
 *    network, 5xx) — either way the caller must NOT demote. */
async function confirmHostRowGone(hostPlayerId: string): Promise<boolean> {
  const { data, error } = await supabase.from('players').select('id').eq('id', hostPlayerId).maybeSingle()
  if (error) return false
  return data === null
}

/**
 * Clears the host-as-player state when the host's own player row disappears
 * from the roster (e.g. the host was removed from another browser/device).
 *
 * Host views track the host-as-player separately (`hostPlayerId` etc.). The
 * roster (`players`) is kept fresh by realtime/polling, but nothing reconciled
 * the host-player state against it — so a "Playing as …" bar would linger after
 * the host's row was deleted elsewhere.
 *
 * Absence from `players` is a HINT, never proof. The roster is set to `[]` when a
 * read fails non-retriably (`supabasePollOk` only rejects retriable errors, so a
 * 42501 / 400 arrives as `data: null`), and a load captured before the host sat down
 * can resolve after one that included them. Acting on either demotes a seated host to
 * a watcher and clears their session — which drops the resume token the server needs
 * to hand the seat back (api/players reclaim), and a fresh join into an active game is
 * forced to spectator. That makes a false positive permanent. So confirm against the
 * server and fire only on a definitive "row is gone"; anything unverifiable leaves the
 * host seated and lets the next roster settle it.
 *
 * @param players        Current roster (only `id` is read).
 * @param hostPlayerId   The host's own player id, or null when not playing.
 * @param onSelfRemoved  Called once the host's row is confirmed gone.
 */
export function useHostPlayerReconciliation(
  players: { id: string }[],
  hostPlayerId: string | null,
  onSelfRemoved: () => void
) {
  const seenRef = useRef(false)
  const cbRef = useRef(onSelfRemoved)
  const checkingRef = useRef(false)

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
      return
    }
    // Only "was present, now gone" is worth a check — this avoids false positives during
    // the join flow, where `hostPlayerId` is set a beat before `load()` fills `players`.
    if (!seenRef.current || checkingRef.current) return

    checkingRef.current = true
    let cancelled = false
    void (async () => {
      try {
        const gone = await confirmHostRowGone(hostPlayerId)
        if (cancelled || !gone) return
        seenRef.current = false
        cbRef.current()
      } finally {
        checkingRef.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  }, [players, hostPlayerId])
}
