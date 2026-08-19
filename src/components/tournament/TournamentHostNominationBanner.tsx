'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Player-side prompt for claim-based tournament host transfer. Only appears
 * when THIS device's tournament player id matches tournaments.pending_host_
 * player_id. Accept posts to /claim-host with the viewer's resume token, the
 * server rotates the tournament host_token, and we save the new host_token
 * to localStorage so re-loading the tournament page puts us in control.
 *
 * `myPlayerId` and `resumeToken` are passed in rather than looked up here
 * because the parent tournament page already computes them from state +
 * localStorage; keeping the banner stateless-of-those makes it trivial to
 * unmount / hide when the viewer leaves the tournament.
 */
export function TournamentHostNominationBanner({
  tournamentId,
  pendingPlayerId,
  myPlayerId,
  resumeToken,
}: {
  tournamentId: string
  pendingPlayerId: string | null
  myPlayerId: string | null
  resumeToken: string | null
}) {
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nominatedIsMe = !!pendingPlayerId && !!myPlayerId && pendingPlayerId === myPlayerId

  // A fresh invite (previous null → matching us) should always show, even if
  // the player previously dismissed an older one. Reset dismissed on the
  // pending id changing to us again.
  useEffect(() => {
    if (nominatedIsMe) setDismissed(false)
  }, [nominatedIsMe])

  const accept = useCallback(async () => {
    if (!tournamentId || !resumeToken) {
      setError('Rejoin to accept — your player session is missing.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/claim-host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken }),
      })
      const data = (await res.json().catch(() => ({}))) as { hostToken?: string; error?: string }
      if (!res.ok || !data.hostToken) {
        setError(data.error ?? 'Could not accept — the invite may have been cancelled.')
        setBusy(false)
        return
      }
      // Save the new host token so a reload on this tab lands us as host.
      // Full page reload so every read-once state (host chrome, edit
      // settings, etc.) gets the new token in one clean pass.
      window.localStorage.setItem(`tournament_host_${tournamentId}`, data.hostToken)
      window.location.href = `/tournament/${tournamentId}`
    } catch {
      setError('Network error — try again')
      setBusy(false)
    }
  }, [tournamentId, resumeToken])

  const decline = useCallback(async () => {
    setDismissed(true)
    if (!tournamentId || !resumeToken) return
    try {
      await fetch(`/api/tournaments/${tournamentId}/decline-host`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken }),
      })
    } catch {
      // ignored — banner is already hidden locally
    }
  }, [tournamentId, resumeToken])

  if (!nominatedIsMe || dismissed || typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-4 pointer-events-none">
      <div className="glass-card pointer-events-auto w-full max-w-md rounded-2xl p-4 space-y-3 border border-[var(--primary)]/40">
        <div className="flex items-start gap-3">
          <span className="text-2xl">👑</span>
          <div className="min-w-0">
            <p className="font-black text-body">You&apos;ve been invited to host</p>
            <p className="text-sm text-muted">
              Accept to take over hosting this tournament. The current host loses control the moment you do.
            </p>
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
            {busy ? 'Accepting…' : 'Accept & host'}
          </button>
          <button
            type="button"
            onClick={decline}
            disabled={busy}
            className="btn-secondary px-4 py-2.5 disabled:opacity-60"
          >
            Decline
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
