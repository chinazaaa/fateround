'use client'

/**
 * IdleWarningBanner (web) — T-13min "keep this lobby open" prompt for the host.
 *
 * Mirrors apps/mobile/components/host/IdleWarningBanner.tsx. Shows when
 * `last_activity_at` is older than 13 minutes and `host_idle_warning_sent_at`
 * is null. Keep-open POSTs `keep_lobby_alive: true` to the game PATCH — the
 * server bumps activity + stamps the warning column, so the banner never
 * re-fires for this game.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Game } from '@/types'

const WARN_AT_MS = 13 * 60 * 1000
const RECHECK_INTERVAL_MS = 30_000

type Props = {
  game: Game
  gameCode: string
  hostToken: string
  onSaved?: () => void
}

export function IdleWarningBanner({ game, gameCode, hostToken, onSaved }: Props) {
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (game.status !== 'waiting') return undefined
    const t = setInterval(() => setNow(Date.now()), RECHECK_INTERVAL_MS)
    return () => clearInterval(t)
  }, [game.status])

  // Client-side fallback for the T-13 push. Fires once the banner reaches
  // its trigger threshold on the host's device so the push still goes out
  // when the operator hasn't configured the pg_cron job yet. The endpoint's
  // atomic stamp makes this a no-op if the cron beat us to it.
  useEffect(() => {
    if (game.status !== 'waiting') return
    if (game.host_idle_warning_sent_at) return
    const lastMs = game.last_activity_at ? new Date(game.last_activity_at).getTime() : 0
    if (!lastMs || now - lastMs < WARN_AT_MS) return
    void fetch(`/api/games/${gameCode.toUpperCase()}/warn-idle-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken }),
    }).catch(() => undefined)
  }, [game.status, game.host_idle_warning_sent_at, game.last_activity_at, now, gameCode, hostToken])

  const onKeepOpen = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/${gameCode.toUpperCase()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, keep_lobby_alive: true }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not keep the lobby open')
      }
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not keep the lobby open')
    } finally {
      setBusy(false)
    }
  }, [gameCode, hostToken, onSaved])

  if (game.status !== 'waiting') return null
  if (game.host_idle_warning_sent_at) return null
  const lastMs = game.last_activity_at ? new Date(game.last_activity_at).getTime() : 0
  if (!lastMs) return null
  if (now - lastMs < WARN_AT_MS) return null

  return (
    <div className="glass-card flex flex-col gap-2 !p-4">
      <p className="text-sm font-bold text-body">⏳ This lobby closes in 2 minutes</p>
      <p className="text-xs text-muted">Nobody joined and the game hasn’t started. Tap to keep it open.</p>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      <button
        type="button"
        onClick={() => void onKeepOpen()}
        disabled={busy}
        className="btn-primary btn-fit self-start px-4 text-sm py-1.5 disabled:opacity-60"
      >
        {busy ? 'Working…' : 'Keep open'}
      </button>
    </div>
  )
}
