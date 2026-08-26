'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { supabasePollOk } from '@/hooks/usePolling'
import { getPlayerSession } from '@/lib/utils'

/**
 * Player-side prompt for claim-based host transfer. Polls the game's pending nomination and,
 * when THIS player is the nominee, offers an "accept host" banner. Accepting calls
 * /api/games/[code]/claim-host with the player's own resume_token; the server mints a fresh
 * host_token and we navigate to the host view with it. Mounted in the player chrome, so it's
 * available on every player view.
 */
export function HostNominationBanner() {
  const params = useParams()
  const router = useRouter()
  const code = typeof params?.code === 'string' ? params.code.toUpperCase() : null

  // Nomination state has three shapes:
  //   'named-nominee' — I am pending_host_player_id; show "Accept & host".
  //   'open-claim'    — someone else is nominated, but they've ignored it long enough
  //                      (>OPEN_CLAIM_AFTER_MS) that /claim-host will honour a claim from
  //                      any eligible player. Show "Nobody accepted — Claim host".
  //   'idle'          — no active nomination for me.
  const [state, setState] = useState<'named-nominee' | 'open-claim' | 'idle'>('idle')
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Kept in sync with the server threshold in /api/games/[code]/claim-host so the button
  // doesn't appear before the server would actually honour the open claim.
  const OPEN_CLAIM_AFTER_MS = 60_000

  const check = useCallback(async () => {
    if (!code) return
    const session = getPlayerSession(code)
    if (!session?.playerId) {
      setState('idle')
      return
    }
    const res = await supabase
      .from('games')
      .select('pending_host_player_id, pending_host_nominated_at')
      .eq('id', code)
      .maybeSingle()
    // On a transient query error, keep the current state rather than hiding the banner from
    // the real nominee — the next poll recovers.
    if (!supabasePollOk(res)) return
    const pending = (res.data?.pending_host_player_id as string | null) ?? null
    const nominatedAt = (res.data?.pending_host_nominated_at as string | null) ?? null
    resolveState(pending, nominatedAt, session.playerId)
  }, [code])

  function resolveState(pending: string | null, nominatedAt: string | null, myPlayerId: string) {
    if (!pending) {
      setState('idle')
      setDismissed(false)
      return
    }
    if (pending === myPlayerId) {
      setState('named-nominee')
      return
    }
    const stale = !!nominatedAt && Date.now() - new Date(nominatedAt).getTime() >= OPEN_CLAIM_AFTER_MS
    if (stale) {
      setState('open-claim')
      return
    }
    setState('idle')
    setDismissed(false)
  }

  useEffect(() => {
    if (!code) return
    void check()
    window.addEventListener('focus', check)
    // Event-driven: the pending nomination lives on the games row, so react to its realtime
    // UPDATE directly (reading the payload — no fetch) instead of polling every 5s for a rare
    // event. This ran on every player of every game (~10 games-queries/s per 50-player room).
    // Distinct channel topic so it can't collide with the game view's `sync-<code>` channel
    // (supabase-js keys channels by topic and throws on reuse).
    const channel = supabase
      .channel(`host-nomination-${code}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${code}` },
        (payload) => {
          const row = payload.new as {
            pending_host_player_id?: string | null
            pending_host_nominated_at?: string | null
          }
          const pending = row?.pending_host_player_id ?? null
          const nominatedAt = row?.pending_host_nominated_at ?? null
          const session = getPlayerSession(code)
          if (!session?.playerId) {
            setState('idle')
            return
          }
          resolveState(pending, nominatedAt, session.playerId)
        }
      )
      .subscribe()
    // Slow safety net in case a socket blip drops the realtime event, PLUS a faster
    // beat so a non-nominee's "open-claim" prompt lights up close to the 60s threshold
    // without needing a fresh realtime tick (the games row hasn't changed in that window).
    const t = setInterval(check, 10000)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', check)
      supabase.removeChannel(channel)
    }
  }, [code, check])

  const accept = async () => {
    if (!code) return
    const session = getPlayerSession(code)
    if (!session?.resumeToken) {
      setError('Rejoin to accept — your player session is missing.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/${code}/claim-host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: session.resumeToken }),
      })
      const data = (await res.json().catch(() => ({}))) as { hostToken?: string; error?: string }
      if (!res.ok || !data.hostToken) {
        setError(data.error ?? 'Could not accept — the invite may have been cancelled.')
        setBusy(false)
        return
      }
      router.push(`/host/${code}?token=${data.hostToken}`)
    } catch {
      setError('Network error — try again')
      setBusy(false)
    }
  }

  // Decline server-side so the host learns of it (their pending indicator clears), then hide.
  // Best-effort: even if the request fails, dismiss locally so the player isn't stuck.
  //
  // Only the NAMED nominee's decline reaches the server — a non-nominee dismissing the
  // open-claim banner is a personal "not me right now" and mustn't cancel someone else's
  // pending nomination.
  const decline = async () => {
    setDismissed(true)
    if (state !== 'named-nominee') return
    if (!code) return
    const session = getPlayerSession(code)
    if (!session?.resumeToken) return
    try {
      await fetch(`/api/games/${code}/decline-host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: session.resumeToken }),
      })
    } catch {
      // ignored — the banner is already hidden locally
    }
  }

  if (!code || state === 'idle' || dismissed || typeof document === 'undefined') return null

  const isOpenClaim = state === 'open-claim'
  const title = isOpenClaim ? 'Nobody accepted — you can host' : "You've been invited to host"
  const body = isOpenClaim
    ? 'The current invite has been sitting open. Claim host now to keep the game moving.'
    : 'Accept to take over hosting this game. The current host loses control.'
  const primaryLabel = busy ? 'Accepting…' : isOpenClaim ? 'Claim host' : 'Accept & host'

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-4 pointer-events-none">
      <div className="glass-card pointer-events-auto w-full max-w-md rounded-2xl p-4 space-y-3 border border-[var(--primary)]/40">
        <div className="flex items-start gap-3">
          <span className="text-2xl">👑</span>
          <div className="min-w-0">
            <p className="font-black text-body">{title}</p>
            <p className="text-sm text-muted">{body}</p>
          </div>
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={accept}
            disabled={busy}
            className="btn-primary flex-1 px-4 py-2.5 disabled:opacity-60"
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            onClick={decline}
            disabled={busy}
            className="btn-secondary px-4 py-2.5 disabled:opacity-60"
          >
            {isOpenClaim ? 'Not now' : 'Decline'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
