'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { supabasePollOk } from '@/hooks/usePolling'
import { getPlayerSession } from '@/lib/utils'
import { rememberNominee, readNominee } from '@/lib/host-transfer'

type PlayerRow = { id: string; name: string; spectator: boolean | null }

/**
 * Host-side control for claim-based host transfer. Lets the host nominate a player to take
 * over; the nominee then accepts on their own device (HostNominationBanner). Mounted in the
 * host chrome so it's available on every host view. Renders nothing without a host token.
 */
export function TransferHostControl() {
  const params = useParams()
  const searchParams = useSearchParams()
  const code = typeof params?.code === 'string' ? params.code.toUpperCase() : null
  const hostToken = searchParams.get('token') ?? ''

  const [open, setOpen] = useState(false)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [declinedNotice, setDeclinedNotice] = useState<string | null>(null)

  // Track the last-seen nomination so we can detect the moment it clears, and a flag for
  // when *we* cleared it (cancel) so a self-cancel isn't misread as a player decline.
  const prevPendingRef = useRef<string | null>(null)
  const selfClearedRef = useRef(false)

  const refreshPending = useCallback(async () => {
    if (!code) return
    const res = await supabase.from('games').select('pending_host_player_id').eq('id', code).maybeSingle()
    // On a transient query error, keep the current state rather than clearing the pending
    // badge (which would also misfire the decline detection below). The next poll recovers.
    if (!supabasePollOk(res)) return
    const next = (res.data?.pending_host_player_id as string | null) ?? null
    const prev = prevPendingRef.current
    prevPendingRef.current = next
    setPendingId(next)

    // The nomination just cleared and we didn't cancel it ourselves → the nominee acted.
    // Accepting also clears it, but that rotates our token; if we're still a valid host it
    // was a decline. (On accept, the host page swaps to the "Host transferred" screen.)
    if (prev && !next) {
      if (selfClearedRef.current) {
        selfClearedRef.current = false
      } else {
        const res = await fetch(`/api/games/${code}/verify-host`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken }),
        }).catch(() => null)
        const stillHost = res?.ok ? (((await res.json().catch(() => ({}))) as { ok?: boolean }).ok ?? false) : false
        if (stillHost) {
          setDeclinedNotice(`${readNominee(code) || 'The player'} declined the host invite`)
          rememberNominee(code, null)
        }
      }
    }
  }, [code, hostToken])

  // Keep the pending nomination in sync so the button reflects an outstanding invite and
  // clears once the nominee accepts (or the invite is cancelled).
  useEffect(() => {
    void refreshPending()
    const t = setInterval(refreshPending, 6000)
    return () => clearInterval(t)
  }, [refreshPending])

  // Auto-dismiss the "declined" notice after a few seconds.
  useEffect(() => {
    if (!declinedNotice) return
    const t = setTimeout(() => setDeclinedNotice(null), 6000)
    return () => clearTimeout(t)
  }, [declinedNotice])

  const loadPlayers = useCallback(async () => {
    if (!code) return
    const { data } = await supabase
      .from('players')
      .select('id,name,spectator')
      .eq('game_id', code)
      .order('joined_at', { ascending: true })
    // Exclude spectators and the host's own player (host+play mode) — you can't transfer to yourself.
    const selfId = getPlayerSession(code)?.playerId ?? null
    setPlayers(((data as PlayerRow[]) ?? []).filter((p) => !p.spectator && p.id !== selfId))
  }, [code])

  const openPicker = () => {
    setError(null)
    setOpen(true)
    void loadPlayers()
    void refreshPending()
  }

  const nominate = async (playerId: string | null) => {
    if (!code) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/${code}/transfer-host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, playerId }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }
      if (!playerId) selfClearedRef.current = true // cancelling — don't misread as a decline
      prevPendingRef.current = playerId
      setPendingId(playerId)
      // Remember who we handed off to so the "host transferred to X" screen can name them
      // once our own token stops working. Cleared when the invite is cancelled.
      if (code) rememberNominee(code, playerId ? (players.find((p) => p.id === playerId)?.name ?? null) : null)
      if (!playerId) setOpen(false)
    } catch {
      setError('Network error — try again')
    } finally {
      setBusy(false)
    }
  }

  if (!code || !hostToken) return null

  const pendingPlayer = players.find((p) => p.id === pendingId)

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-label="Transfer host"
        title={pendingId ? 'Host invite pending' : 'Transfer host to a player'}
        className="relative flex items-center gap-1.5 rounded-full px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium transition-all duration-200 glass-card"
        style={{ color: 'var(--muted)' }}
      >
        <HandoffIcon />
        <span className="hidden sm:inline">Host</span>
        {pendingId ? (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[var(--primary)] animate-pulse" />
        ) : null}
      </button>

      {declinedNotice && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-x-0 top-16 z-[70] flex justify-center px-4 pointer-events-none">
              <div
                className="glass-card pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-body border border-[var(--border)]"
                role="status"
              >
                <span>{declinedNotice}</span>
                <button
                  type="button"
                  onClick={() => setDeclinedNotice(null)}
                  aria-label="Dismiss"
                  className="text-muted hover:text-body text-lg leading-none"
                >
                  ×
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center px-4 pointer-events-auto"
              style={{ background: 'rgba(0,0,0,0.55)' }}
              onClick={() => setOpen(false)}
            >
              <div
                className="glass-card w-full max-w-sm rounded-2xl p-5 space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-black text-body">Transfer host</h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                    className="text-muted hover:text-body text-xl leading-none"
                  >
                    ×
                  </button>
                </div>

                {pendingId ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">
                      Waiting for <span className="font-bold text-body">{pendingPlayer?.name ?? 'the player'}</span> to
                      accept. They&apos;ll see an invite on their screen. You stay host until they accept.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => nominate(null)}
                      className="btn-secondary w-full px-4 py-2.5 disabled:opacity-60"
                    >
                      Cancel invite
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">
                      Pick a player to become the new host. They must accept before control moves — you&apos;ll lose
                      host access the moment they do.
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-1.5">
                      {players.length === 0 ? (
                        <p className="text-sm text-muted py-4 text-center">No players to transfer to yet.</p>
                      ) : (
                        players.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            disabled={busy}
                            onClick={() => nominate(p.id)}
                            className="w-full text-left rounded-xl px-4 py-3 font-medium text-body transition-colors hover:bg-[var(--primary)]/10 disabled:opacity-60 border border-[var(--border)]/60"
                          >
                            {p.name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {error ? <p className="text-sm text-red-500">{error}</p> : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

function HandoffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 12h13" />
      <path d="M13 6l6 6-6 6" />
      <circle cx="4" cy="6" r="1.5" />
      <circle cx="4" cy="18" r="1.5" />
    </svg>
  )
}
