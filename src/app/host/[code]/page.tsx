'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LOAD_TIMEOUT_MS, supabasePollOk } from '@/hooks/usePolling'
import { HOST_GAME_SELECT } from '@/lib/supabase-selects'
import { parseGameType } from '@/lib/game-types'
import { HOST_VIEW_REGISTRY } from '@/components/game-host-views'
import { PollHostView } from '@/components/poll-game/PollHostView'
import { readNominee, rememberNominee } from '@/lib/host-transfer'
import type { Game } from '@/types'

/**
 * Host-screen dispatcher. Verifies the host token, resolves the game type, then renders
 * the dedicated host view for board games or `PollHostView` for the poll-family games.
 * All the heavy per-game state / realtime / rendering lives in those components — this
 * page stays a thin load-and-dispatch.
 */
export default function HostPage() {
  const { code } = useParams<{ code: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const gameCode = (Array.isArray(code) ? code[0] : code).toUpperCase()
  const hostToken = searchParams.get('token') ?? ''

  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [authError, setAuthError] = useState(false)
  // Non-null once this host's token stops working because they handed off. `to` is the
  // nominee's name (remembered locally at nominate time), or null if we can't name them.
  const [transferred, setTransferred] = useState<{ to: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoadError(false)
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS))
      try {
        await Promise.race([
          (async () => {
            // Verify the host token FIRST (host_token is no longer client-readable, migration
            // 0122) so an invalid-token visitor never receives host-only game fields.
            const verifyRes = await fetch(`/api/games/${gameCode}/verify-host`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hostToken }),
            })
            if (!verifyRes.ok) throw new Error('unavailable')
            const verifyData = (await verifyRes.json().catch(() => ({ ok: false }))) as { ok?: boolean }
            if (!verifyData.ok) {
              if (cancelled) return
              // If we had an outstanding nomination for this game, a now-invalid token means
              // the nominee accepted — show a graceful hand-off screen instead of "denied".
              const nominee = readNominee(gameCode)
              if (nominee !== null) setTransferred({ to: nominee || null })
              else setAuthError(true)
              return
            }

            const gameRes = await supabase.from('games').select(HOST_GAME_SELECT).eq('id', gameCode).maybeSingle()
            if (!supabasePollOk(gameRes)) throw new Error('unavailable')
            if (!gameRes.data) {
              if (!cancelled) setAuthError(true)
              return
            }
            if (!cancelled) setGame(gameRes.data)
          })(),
          timeout,
        ])
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [gameCode, hostToken])

  // Once authorized, re-check the token periodically. If it stops working while the host is
  // watching, the nominee has accepted — swap to the graceful hand-off screen in place.
  useEffect(() => {
    if (!game || transferred || authError) return
    let stop = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/games/${gameCode}/verify-host`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken }),
        })
        if (!res.ok) return
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean }
        if (!stop && data.ok === false) setTransferred({ to: readNominee(gameCode) || null })
      } catch {
        // Network blips are ignored — only an explicit ok:false demotes the screen.
      }
    }
    const t = setInterval(poll, 6000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [game, transferred, authError, gameCode, hostToken])

  // Once we've shown the hand-off screen, consume the remembered nominee so a later visit
  // with a genuinely bad token doesn't wrongly read as a transfer.
  useEffect(() => {
    if (transferred) rememberNominee(gameCode, null)
  }, [transferred, gameCode])

  if (loading) {
    return (
      <div className="page-wrap flex items-center justify-center">
        <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="page-wrap flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-6xl">⚠️</p>
          <h1 className="text-2xl font-black text-body">Can&apos;t reach the server</h1>
          <p className="text-muted">The database is slow or temporarily unavailable. Wait a moment, then try again.</p>
          <button type="button" onClick={() => window.location.reload()} className="btn-primary px-6 py-3">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (transferred) {
    return (
      <div className="page-wrap flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-6xl">👑</p>
          <h1 className="text-2xl font-black text-body">Host transferred</h1>
          <p className="text-muted">
            {transferred.to
              ? `You handed hosting to ${transferred.to}. They're running the game now.`
              : 'Hosting has been handed to another player. They’re running the game now.'}
          </p>
          <button onClick={() => router.push(`/game/${gameCode}`)} className="btn-primary px-6 py-3">
            Join as a player
          </button>
        </div>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="page-wrap flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-6xl">🔒</p>
          <h1 className="text-2xl font-black text-body">Access Denied</h1>
          <p className="text-muted">Invalid or missing host token</p>
          <button onClick={() => router.push('/')} className="btn-secondary px-6 py-3">
            Go Home
          </button>
        </div>
      </div>
    )
  }

  if (game) {
    const DedicatedHostView = HOST_VIEW_REGISTRY[parseGameType(game.game_type)]
    if (DedicatedHostView) return <DedicatedHostView gameCode={gameCode} hostToken={hostToken} />
    return <PollHostView gameCode={gameCode} hostToken={hostToken} />
  }

  return null
}
