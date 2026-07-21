'use client'

import { useState } from 'react'
import { LateJoinPolicyToggle } from '@/components/AllowViewersToggle'
import { useToast } from '@/components/ui/Toast'
import {
  gameAllowsLatePlayerJoin,
  gameSupportsViewerSetting,
  lateJoinPolicyFromGame,
  type LateJoinPolicy,
} from '@/lib/viewers'
import type { Game } from '@/types'

export function HostAllowViewersField({
  gameCode,
  hostToken,
  game,
  onGameUpdate,
  className = '',
  embedded = false,
  hideHeader = false,
}: {
  gameCode: string
  hostToken: string
  game: Game
  /** Optional — callers that poll/subscribe (e.g. the central HostLobby sheet) pick up the
   *  updated game on their own; others pass it for instant optimistic feedback. */
  onGameUpdate?: (game: Game) => void
  className?: string
  embedded?: boolean
  /** Hide title and helper copy when a parent section already provides them. */
  hideHeader?: boolean
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  if (!gameSupportsViewerSetting(game.game_type)) return null
  // View-only games (board games etc.) offer no view-vs-play choice now that
  // "Lobby only" is gone — hide the whole late-joiners line.
  if (!gameAllowsLatePlayerJoin(game.game_type)) return null

  const value = lateJoinPolicyFromGame(game)

  const onChange = async (next: LateJoinPolicy) => {
    if (saving || value === next) return
    const previous = value
    const optimistic = {
      ...game,
      allow_viewers: next !== 'lobby_only',
      allow_late_players: next === 'viewers_and_players',
      ...(game.game_type === 'codewords' ? { codewords_late_join: next === 'viewers_and_players' } : {}),
    }
    onGameUpdate?.(optimistic)
    setSaving(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, late_join_policy: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        onGameUpdate?.(game)
        toast.error(data.error || 'Failed to update late join setting')
        return
      }
      if (data.game) onGameUpdate?.(data.game)
    } finally {
      setSaving(false)
    }
  }

  const body = (
    <div className={`space-y-3 ${className}`}>
      {!hideHeader && (
        <div className="space-y-1">
          <p className="label-caps">Late joiners</p>
          <p className="text-xs text-muted leading-relaxed">
            Choose whether people can join after the game starts. Viewers watch live without playing.
          </p>
        </div>
      )}
      <LateJoinPolicyToggle value={value} onChange={onChange} disabled={saving} gameType={game.game_type} />
    </div>
  )

  if (embedded) return body

  return <div className="glass-card p-4 sm:p-5">{body}</div>
}
