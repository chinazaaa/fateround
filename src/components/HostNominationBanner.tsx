'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
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

  const [nominated, setNominated] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    if (!code) return
    const session = getPlayerSession(code)
    if (!session?.playerId) {
      setNominated(false)
      return
    }
    const { data } = await supabase.from('games').select('pending_host_player_id').eq('id', code).maybeSingle()
    const pending = (data?.pending_host_player_id as string | null) ?? null
    const isMe = !!pending && pending === session.playerId
    setNominated(isMe)
    if (!isMe) setDismissed(false) // reset so a fresh future invite shows again
  }, [code])

  useEffect(() => {
    void check()
    const t = setInterval(check, 5000)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', check)
    }
  }, [check])

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
  const decline = async () => {
    setDismissed(true)
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

  if (!code || !nominated || dismissed) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-4 pointer-events-none">
      <div className="glass-card pointer-events-auto w-full max-w-md rounded-2xl p-4 space-y-3 border border-[var(--primary)]/40">
        <div className="flex items-start gap-3">
          <span className="text-2xl">👑</span>
          <div className="min-w-0">
            <p className="font-black text-body">You&apos;ve been invited to host</p>
            <p className="text-sm text-muted">Accept to take over hosting this game. The current host loses control.</p>
          </div>
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={accept} disabled={busy} className="btn-primary flex-1 px-4 py-2.5 disabled:opacity-60">
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
    </div>
  )
}
