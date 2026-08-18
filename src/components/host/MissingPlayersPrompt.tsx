'use client'

/**
 * MissingPlayersPrompt — dismissible "make it Public" nudge for the web host lobby.
 *
 * Mirrors apps/mobile/components/host/MissingPlayersPrompt.tsx. Fires when the
 * game has been waiting > 30s, is still private, isn't strictly 1v1, and at
 * least 2 seats are still empty. Dismissed per game_code via localStorage so a
 * private-night host isn't re-prompted for the rest of the lobby.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Game } from '@/types'
import { isHeadToHeadGame } from '@/lib/public-hints'

const WAIT_MS = 30_000

function dismissKey(gameCode: string): string {
  return `missing-players-dismissed.${gameCode.toUpperCase()}`
}

type Props = {
  game: Game
  gameCode: string
  hostToken: string
  activePlayers: number
  maxPlayers: number | null
  onSaved?: () => void
}

export function MissingPlayersPrompt({ game, gameCode, hostToken, activePlayers, maxPlayers, onSaved }: Props) {
  const [waitElapsed, setWaitElapsed] = useState(false)
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (game.status !== 'waiting') return undefined
    const t = setTimeout(() => setWaitElapsed(true), WAIT_MS)
    return () => clearTimeout(t)
  }, [game.status, gameCode])

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(dismissKey(gameCode)) === '1')
    } catch {
      setDismissed(false)
    }
  }, [gameCode])

  const onMakePublic = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/games/${gameCode.toUpperCase()}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, is_public: true }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Could not make this game public')
      }
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make this game public')
    } finally {
      setBusy(false)
    }
  }, [gameCode, hostToken, onSaved])

  const onDismiss = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem(dismissKey(gameCode), '1')
    } catch {
      // Best-effort — state is set locally regardless.
    }
  }, [gameCode])

  const eligible =
    game.status === 'waiting' &&
    game.is_public !== true &&
    !isHeadToHeadGame(game.game_type) &&
    maxPlayers != null &&
    maxPlayers >= 2 &&
    activePlayers < maxPlayers - 1

  if (!eligible || dismissed === null || dismissed || !waitElapsed) return null

  return (
    <div className="glass-card relative flex flex-col gap-2 !p-4">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-2 text-xl text-muted hover:text-body"
      >
        ×
      </button>
      <div className="pr-6">
        <p className="text-sm font-bold text-body">Missing players?</p>
        <p className="mt-0.5 text-xs text-muted">Make this game public so anyone browsing can join.</p>
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      <button
        type="button"
        onClick={() => void onMakePublic()}
        disabled={busy}
        className="btn-primary btn-fit self-start px-4 text-sm py-1.5 disabled:opacity-60"
      >
        {busy ? 'Making public…' : 'Make public'}
      </button>
    </div>
  )
}
