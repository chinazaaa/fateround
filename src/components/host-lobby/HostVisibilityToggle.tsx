'use client'

import { useEffect, useState } from 'react'
import { Toggle } from '@/components/ui/PageShell'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

/**
 * Public/private visibility control for the host lobby — the counterpart to the
 * "Public game" choice on the create screen, so the host can flip it after the
 * fact. Public games are listed in Browse; private ones are invite-only via the
 * share link.
 *
 * Self-contained: it holds optimistic local state and PATCHes the general game
 * settings route, so it can be dropped into any game's lobby (the board games get
 * the same control grouped inside `HostBoardGameLobbyPanel` instead). Host views
 * that poll/subscribe pick up `is_public` on their own; `onGameUpdate` is optional
 * and just lets the caller sync immediately.
 */
export function HostVisibilityToggle({
  gameCode,
  hostToken,
  game,
  onGameUpdate,
}: {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate?: (game: Game) => void
}) {
  const { error: toastError } = useToast()
  const [isPublic, setIsPublic] = useState(game.is_public === true)
  const [saving, setSaving] = useState(false)

  // Keep in sync with the game row (realtime / another device).
  useEffect(() => {
    setIsPublic(game.is_public === true)
  }, [game.is_public])

  const onChange = async (next: boolean) => {
    const prev = isPublic
    setIsPublic(next) // optimistic
    setSaving(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, is_public: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update visibility')
      if (data.game) onGameUpdate?.(data.game)
    } catch (err) {
      setIsPublic(prev) // roll back
      toastError(err instanceof Error ? err.message : 'Failed to update visibility')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={saving ? 'opacity-70 pointer-events-none' : undefined}>
      <Toggle
        label="Public game"
        description="List in Browse so anyone can find and join. Off keeps it invite-only via the share link."
        value={isPublic}
        onChange={(v) => void onChange(v)}
      />
    </div>
  )
}
