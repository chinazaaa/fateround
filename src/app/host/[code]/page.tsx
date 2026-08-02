'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { LOAD_TIMEOUT_MS, supabasePollOk } from '@/hooks/usePolling'
import { HOST_GAME_SELECT } from '@/lib/supabase-selects'
import { parseGameType, gameHasHeaderVoice } from '@/lib/game-types'
import { HOST_VIEW_REGISTRY } from '@/components/game-host-views'
import { PollHostView } from '@/components/poll-game/PollHostView'
import { AudioChat } from '@/components/AudioChat'
// import { HostMusicControl } from '@/components/music/HostMusicControl'
import { readNominee, rememberNominee } from '@/lib/host-transfer'
import { rememberHostToken, clearHostToken } from '@/lib/host-session'
import { useHostToken } from '@/hooks/useHostToken'
import { useHostIdentity, useHostDisplayName } from '@/hooks/useHostVoiceIdentity'
import { MatureGameGate } from '@/components/MatureGameGate'
import type { Game } from '@/types'

/**
 * Host-screen dispatcher. Verifies the host token, resolves the game type, then renders
 * the dedicated host view for board games or `PollHostView` for the poll-family games.
 * All the heavy per-game state / realtime / rendering lives in those components — this
 * page stays a thin load-and-dispatch.
 */
export default function HostPage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const gameCode = (Array.isArray(code) ? code[0] : code).toUpperCase()
  // URL token drives the primary flow; when it's absent (host reopened /host/[code] on
  // this device) we fall back to the remembered token — resolved in an effect so there's
  // no hydration mismatch, and `resolved` lets us hold off "access denied" until checked.
  const { hostToken, resolved } = useHostToken(gameCode)
  // Voice identity for the host's floating pill (mounted for non-header games below).
  const hostIdentity = useHostIdentity(gameCode)
  const hostName = useHostDisplayName(gameCode)

  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [authError, setAuthError] = useState(false)
  // Non-null once this host's token stops working because they handed off. `to` is the
  // nominee's name (remembered locally at nominate time), or null if we can't name them.
  const [transferred, setTransferred] = useState<{ to: string | null } | null>(null)

  // Decide whether an invalid host token is an actual hand-off vs an unrelated invalidation.
  // A remembered nominee is only *intent*; the proof is that the nomination has since cleared
  // (the nominee's claim clears pending_host_player_id and rotates the token). If the invite
  // is still outstanding, this wasn't a transfer — so we fall through to "access denied".
  const confirmHandoff = useCallback(async (): Promise<{ to: string | null } | null> => {
    const nominee = readNominee(gameCode)
    if (nominee === null) return null
    const { data } = await supabase.from('games').select('pending_host_player_id').eq('id', gameCode).maybeSingle()
    if (data && !data.pending_host_player_id) return { to: nominee || null }
    return null
  }, [gameCode])

  useEffect(() => {
    // Hold off until the token is resolved (URL, or the storage fallback checked in an
    // effect) so a clean /host/[code] URL doesn't flash "access denied" before storage reads.
    if (!resolved) return
    let cancelled = false

    async function load() {
      setLoadError(false)
      // Re-evaluate access on every attempt so a transient empty token (e.g. mid client-
      // navigation, before storage resolves) can't leave "access denied" stuck on screen.
      setAuthError(false)
      if (!hostToken) {
        // Resolved with no token anywhere → genuine denial (no URL token, nothing stored).
        if (!cancelled) {
          setAuthError(true)
          setLoading(false)
        }
        return
      }
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
              // Invalid token: show the graceful hand-off screen only if the nomination has
              // actually cleared (nominee claimed); otherwise it's a plain access denial.
              const handoff = await confirmHandoff()
              if (cancelled) return
              if (handoff) {
                // Host handed the game off — the remembered token is now dead weight.
                clearHostToken(gameCode)
                setTransferred(handoff)
              } else setAuthError(true)
              return
            }

            // Token is valid — remember it on this device so the host can reopen the
            // panel later without the saved link (e.g. after closing the tab).
            rememberHostToken(gameCode, hostToken)

            const gameRes = await supabase.from('games').select(HOST_GAME_SELECT).eq('id', gameCode).maybeSingle()
            if (!supabasePollOk(gameRes)) throw new Error('unavailable')
            // The token already verified above, so any failure to load the game row is a
            // load/schema problem — NOT an auth problem. Surface it as the server-error state
            // rather than the misleading "invalid or missing host token" screen. (A real
            // query error like a missing column otherwise slipped through to "Access Denied".)
            if (gameRes.error || !gameRes.data) throw new Error('unavailable')
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
  }, [gameCode, hostToken, confirmHandoff, resolved])

  // Once authorized, re-check the token periodically. If it stops working while the host is
  // watching AND the nomination has cleared, the nominee accepted — swap to the hand-off
  // screen in place. An unrelated token invalidation leaves the host view untouched.
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
        if (stop || data.ok !== false) return
        const handoff = await confirmHandoff()
        if (!stop && handoff) setTransferred(handoff)
      } catch {
        // Network blips are ignored — only an explicit ok:false demotes the screen.
      }
    }
    const t = setInterval(poll, 6000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [game, transferred, authError, gameCode, hostToken, confirmHandoff])

  // Once we've shown the hand-off screen, consume the remembered nominee so a later visit
  // with a genuinely bad token doesn't wrongly read as a transfer.
  useEffect(() => {
    if (transferred) rememberNominee(gameCode, null)
  }, [transferred, gameCode])

  if (loading) {
    // Full-screen cover over the fixed host header so a reload doesn't briefly show the
    // header/tabbed chrome before the per-game view (e.g. the lobby overlay) mounts.
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--background)]">
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
    return (
      <>
        {DedicatedHostView ? (
          <DedicatedHostView gameCode={gameCode} hostToken={hostToken} />
        ) : (
          <PollHostView gameCode={gameCode} hostToken={hostToken} />
        )}
        {/* Floating "Join voice" pill for the host. Skipped for games with the
            header voice rail (Whot) so they don't get two voice controls. */}
        {hostToken && !gameHasHeaderVoice(game.game_type) && (
          <AudioChat roomCode={gameCode} playerName={hostName} auth={{ kind: 'host', token: hostToken }} />
        )}
        {/* Floating DJ panel — persists across lobby + active play for every game type. */}
        {/* <HostMusicControl gameCode={gameCode} hostToken={hostToken} /> */}
        <MatureGameGate gameType={game.game_type} />
      </>
    )
  }

  return null
}
