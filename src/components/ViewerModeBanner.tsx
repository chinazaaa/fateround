'use client'

import { canSwitchViewerToPlayer } from '@/lib/viewers'
import { usePromoteToPlayer } from '@/hooks/usePromoteToPlayer'
import type { Game, Player } from '@/types'

type Props = {
  className?: string
  gameCode?: string
  playerId?: string | null
  game?: Pick<
    Game,
    'status' | 'session_started_at' | 'allow_viewers' | 'allow_late_players' | 'codewords_late_join' | 'game_type'
  > | null
  player?: Pick<Player, 'joined_at' | 'spectator'> | null
  playerDetail?: string
  onPromoted?: () => void | Promise<unknown>
}

export function ViewerModeBanner({
  className = '',
  gameCode,
  playerId,
  game,
  player,
  playerDetail,
  onPromoted,
}: Props) {
  const canPromote = !!(game && player && canSwitchViewerToPlayer(player, game))
  const { promote, promoting } = usePromoteToPlayer(gameCode ?? '', playerId, onPromoted)

  return (
    <div
      className={`rounded-xl border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-4 py-3 text-center text-sm text-body ${className}`}
    >
      <p className="font-semibold">Spectating</p>
      <p className="text-muted text-xs mt-1">
        {canPromote
          ? 'You joined after the game started — watch live or switch to playing now.'
          : 'You joined after the game started — watch only until the next lobby.'}
      </p>
      {canPromote && gameCode && playerId && (
        <button
          type="button"
          onClick={() => void promote()}
          disabled={promoting}
          className="btn-primary mt-3 w-full py-2.5 text-sm font-bold"
        >
          {promoting ? 'Joining…' : 'Join as player'}
        </button>
      )}
      {canPromote && playerDetail && (
        <p className="text-faint text-[11px] mt-2 leading-snug">{playerDetail}</p>
      )}
    </div>
  )
}
