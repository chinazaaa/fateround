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
 * Absence from `players` is a HINT, never proof. A roster can be stale rather than wrong:
 * a load captured before the host sat down can resolve after one that included them (these
 * views run `load()` from realtime, polling and the join path with no generation guard), and
 * nothing guarantees every roster this hook sees came from a successful gated read.
 *
 * Acting on a false hint demotes a seated host to a watcher AND clears their session —
 * which drops the resume token the server needs to hand the seat back (api/players
 * reclaim), and a fresh join into an active game is forced to spectator. That makes a
 * false positive PERMANENT, so absence alone must never be enough. Confirm against the
 * server and fire only on a definitive "row is gone"; anything unverifiable leaves the
 * host seated and lets the next roster settle it.
 *
 * (`supabasePollOk` is now strict, so an errored read no longer wipes a roster to `[]` in
 * the first place. This hook does not rely on that: it is the last line of defense, and the
 * failure it guards is expensive and silent.)
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
  // Latest roster verdict + host id, read when a probe resolves. The probe is deliberately
  // NOT cancelled by a roster rerender: it's the only confirmation in flight, and dropping
  // it would leave a genuine removal unreconciled until the next roster change — which may
  // never come while realtime is connected and the fallback poll is off.
  const absentRef = useRef(false)
  const hostIdRef = useRef(hostPlayerId)
  const mountedRef = useRef(true)

  useEffect(() => {
    cbRef.current = onSelfRemoved
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    hostIdRef.current = hostPlayerId
    if (!hostPlayerId) {
      seenRef.current = false
      absentRef.current = false
      return
    }
    const present = players.some((p) => p.id === hostPlayerId)
    absentRef.current = !present
    if (present) {
      seenRef.current = true
      return
    }
    // Only "was present, now gone" is worth a check — this avoids false positives during
    // the join flow, where `hostPlayerId` is set a beat before `load()` fills `players`.
    // A probe already in flight will re-read `absentRef` when it resolves, so skipping here
    // drops nothing.
    if (!seenRef.current || checkingRef.current) return

    checkingRef.current = true
    const probedId = hostPlayerId
    void (async () => {
      try {
        const gone = await confirmHostRowGone(probedId)
        if (!mountedRef.current || !gone) return
        // Re-validate against the CURRENT state: the roster may have rerendered, or the host
        // re-seated, while the probe was in flight. Anything stale is dropped, not acted on.
        if (hostIdRef.current !== probedId || !absentRef.current || !seenRef.current) return
        seenRef.current = false
        cbRef.current()
      } finally {
        checkingRef.current = false
      }
    })()
  }, [players, hostPlayerId])
}
