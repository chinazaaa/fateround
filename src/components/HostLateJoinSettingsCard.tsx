'use client'

import { HostAllowViewersField } from '@/components/HostAllowViewersField'
import { gameAllowsLatePlayerJoin, gameSupportsViewerSetting } from '@/lib/viewers'
import type { Game } from '@/types'

export function HostLateJoinSettingsCard({
  gameCode,
  hostToken,
  game,
  onGameUpdate,
  className = '',
  bare = false,
}: {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate?: (game: Game) => void
  className?: string
  bare?: boolean
}) {
  if (!gameSupportsViewerSetting(game.game_type)) return null
  // View-only games have no view-vs-play choice — hide the whole card.
  if (!gameAllowsLatePlayerJoin(game.game_type)) return null
  if (game.status !== 'waiting' && game.status !== 'active') return null

  const content = (
    <>
      {game.status === 'active' && (
        <p className="text-xs text-muted leading-relaxed">
          Game in progress — you can still change whether new people may join as viewers.
        </p>
      )}
      <HostAllowViewersField
        embedded
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        onGameUpdate={onGameUpdate}
      />
    </>
  )

  if (bare) return content

  return <div className={`glass-card-strong p-5 sm:p-6 space-y-3 ${className}`}>{content}</div>
}
