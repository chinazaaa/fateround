'use client'

import { canSwitchViewerToPlayer } from '@/lib/viewers'
import { lobbyHasOpenPlayerSeat } from '@/lib/game-limits'
import { usePromoteToPlayer } from '@/hooks/usePromoteToPlayer'
import { PlayIcon } from '@/components/host/host-icons'
import type { Game, Player } from '@/types'

type Props = {
  className?: string
  gameCode?: string
  playerId?: string | null
  game?: Pick<
    Game,
    | 'status'
    | 'session_started_at'
    | 'allow_viewers'
    | 'allow_late_players'
    | 'codewords_late_join'
    | 'game_type'
    | 'tournament_id'
    | 'max_players'
  > | null
  player?: Pick<Player, 'joined_at' | 'spectator'> | null
  players?: ReadonlyArray<Pick<Player, 'spectator'>>
  playerDetail?: string
  onPromoted?: () => void | Promise<unknown>
}

export function ViewerModeBanner({
  className = '',
  gameCode,
  playerId,
  game,
  player,
  players,
  playerDetail,
  onPromoted,
}: Props) {
  const canPromote = !!(game && player && canSwitchViewerToPlayer(player, game, players))
  const { promote, promoting } = usePromoteToPlayer(gameCode ?? '', playerId, onPromoted)

  // When joining as a player is allowed, the CTA lives in a small persistent pill pinned
  // just under the header rather than a one-time inline banner — so a spectator always has
  // a way in, even after the initial "join or watch" prompt is gone or the page has scrolled.
  if (canPromote && gameCode && playerId) {
    return (
      <button
        type="button"
        onClick={() => void promote()}
        disabled={promoting}
        aria-label="Join as player"
        className="fixed left-1/2 top-[4.25rem] z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--primary)_45%,transparent)] bg-[var(--primary)] px-3.5 py-2 text-[0.8125rem] font-bold text-white shadow-[0_6px_20px_var(--primary-glow)] transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
      >
        <PlayIcon size={13} />
        {promoting ? 'Joining…' : 'Join as player'}
      </button>
    )
  }

  // Not promotable (viewers-only game, full lobby, or joining not allowed): a quiet inline
  // "you're watching" note — no join CTA, since there's nothing to promote into.
  return (
    <div
      className={`mb-3 rounded-xl border border-[color-mix(in_srgb,var(--primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-4 py-3 text-center text-sm text-body ${className}`}
    >
      <p className="font-semibold">Spectating</p>
      <p className="text-muted text-xs mt-1">
        {players && game && !lobbyHasOpenPlayerSeat(game, players)
          ? 'This game is full — you can watch, but there are no open player seats.'
          : "You're spectating. If you want to play, join when the lobby opens."}
      </p>
    </div>
  )
}
