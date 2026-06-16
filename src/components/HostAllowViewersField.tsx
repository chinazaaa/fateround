'use client'

import { useState } from 'react'
import { LateJoinPolicyToggle } from '@/components/AllowViewersToggle'
import { useToast } from '@/components/ui/Toast'
import { gameSupportsViewerSetting, lateJoinPolicyFromGame, type LateJoinPolicy } from '@/lib/viewers'
import type { Game } from '@/types'

export function HostAllowViewersField({
  gameCode,
  hostToken,
  game,
  onGameUpdate,
  className = '',
}: {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate: (game: Game) => void
  className?: string
}) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  if (!gameSupportsViewerSetting(game.game_type)) return null

  const value = lateJoinPolicyFromGame(game)

  const onChange = async (next: LateJoinPolicy) => {
    if (saving || value === next) return
    const previous = value
    const optimistic = {
      ...game,
      allow_viewers: next !== 'lobby_only',
      allow_late_players: next === 'viewers_and_players',
      ...(game.game_type === 'codewords'
        ? { codewords_late_join: next === 'viewers_and_players' }
        : {}),
    }
    onGameUpdate(optimistic)
    setSaving(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, late_join_policy: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        onGameUpdate(game)
        toast.error(data.error || 'Failed to update late join setting')
        return
      }
      if (data.game) onGameUpdate(data.game)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <p className="text-muted text-xs uppercase tracking-wider">Late joiners</p>
      <LateJoinPolicyToggle value={value} onChange={onChange} disabled={saving} />
    </div>
  )
}
