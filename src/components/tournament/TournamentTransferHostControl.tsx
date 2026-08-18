'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToast } from '@/components/ui/Toast'
import type { TournamentPlayer } from '@/types/tournament'

/**
 * Host-side control for claim-based host transfer on a tournament. The host
 * picks a joined, non-eliminated player; the nominee accepts on their own
 * device (see TournamentHostNominationBanner). Server rotates host_token on
 * accept — outgoing host loses control the moment the new host claims.
 *
 * Mirrors the game version's UX (picker modal, "waiting for X" state,
 * cancel invite), scoped to a tournament roster + endpoints. Does not do
 * the game version's elaborate decline-detection round-trip; the outgoing
 * host learns of a decline when the pending indicator on the tournament
 * clears back to null (visible via useTournamentRealtime).
 */
export function TournamentTransferHostControl({
  tournamentId,
  hostToken,
  players,
  pendingPlayerId,
  triggerClassName,
}: {
  tournamentId: string
  hostToken: string | null
  players: TournamentPlayer[]
  /** tournaments.pending_host_player_id — the nominee awaiting acceptance. */
  pendingPlayerId: string | null
  triggerClassName?: string
}) {
  const { success, error: toastError } = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Track the previous pending value so a "just cleared" transition can
  // surface a decline toast without a second server round-trip.
  const prevPendingRef = useRef<string | null>(pendingPlayerId)
  useEffect(() => {
    const prev = prevPendingRef.current
    if (prev && !pendingPlayerId) {
      // Cleared while we still hold the host token → the nominee declined
      // OR someone cancelled. Only surface the toast when the outgoing host
      // is still viewing (this component only mounts for hosts anyway) and
      // we didn't already show a modal-side success message.
      const name = players.find((p) => p.id === prev)?.player_name ?? 'They'
      success(`${name} didn't accept — you're still host`)
      setOpen(false)
    }
    prevPendingRef.current = pendingPlayerId
  }, [pendingPlayerId, players, success])

  // Eligible nominees: joined, non-eliminated players. Sorted by join order.
  const candidates = [...players]
    .filter((p) => !p.is_eliminated)
    .sort((a, b) => (a.joined_at || '').localeCompare(b.joined_at || ''))

  const nominate = useCallback(
    async (playerId: string | null) => {
      if (!hostToken) return
      setBusy(true)
      setError(null)
      try {
        const res = await fetch(`/api/tournaments/${tournamentId}/transfer-host`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken, playerId }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          setError(data.error ?? 'Something went wrong')
          return
        }
        if (!playerId) {
          success('Invite cancelled')
          setOpen(false)
        } else {
          success('Invite sent — waiting for them to accept')
        }
      } catch {
        setError('Network error — try again')
      } finally {
        setBusy(false)
      }
    },
    [tournamentId, hostToken, success]
  )

  if (!hostToken) return null

  const pendingPlayer = pendingPlayerId ? players.find((p) => p.id === pendingPlayerId) : null

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        aria-label="Transfer host"
        title={pendingPlayerId ? 'Host invite pending' : 'Transfer host to a player'}
        className={triggerClassName ?? 'btn-secondary btn-fit text-sm relative flex items-center gap-1.5'}
        style={{ position: 'relative' }}
      >
        <span>🔀 Transfer host</span>
        {pendingPlayerId && (
          <span
            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full animate-pulse"
            style={{ background: 'var(--primary)' }}
          />
        )}
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-center justify-center px-4"
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

                {pendingPlayerId ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">
                      Waiting for{' '}
                      <span className="font-bold text-body">{pendingPlayer?.player_name ?? 'the player'}</span> to
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
                      {candidates.length === 0 ? (
                        <p className="text-sm text-muted py-4 text-center">
                          No eligible players yet — nobody&apos;s joined.
                        </p>
                      ) : (
                        candidates.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            disabled={busy}
                            onClick={() => nominate(p.id)}
                            className="w-full text-left rounded-xl px-4 py-3 font-medium text-body transition-colors hover:bg-[var(--primary)]/10 disabled:opacity-60 border border-theme"
                          >
                            {p.player_name}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {error ? (
                  <p className="text-sm text-red-500">
                    {error}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null)
                        toastError(error)
                      }}
                      className="ml-2 underline"
                    >
                      dismiss
                    </button>
                  </p>
                ) : null}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
