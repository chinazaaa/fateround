'use client'

import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { playerIsViewer } from '@/lib/viewers'
import type { Game, GameType, Player } from '@/types'

/**
 * Standardized Manage body for simple games: an optional top slot (host-mode selector),
 * players list + a separate viewers list, a "how to play" row, then caller-supplied
 * settings and footer (start/end). Never renders a board.
 *
 * Participants vs viewers are only split once the game is active — in the lobby the
 * `spectator` flag means "not ready yet", which is shown via the ready pill instead.
 */
export function HostManageSection({
  game,
  players,
  highlightPlayerId,
  removingPlayerId,
  onRemovePlayer,
  playersLabel = 'Players',
  gameType,
  top,
  settings,
  footer,
}: {
  game: Game
  players: Player[]
  highlightPlayerId?: string | null
  removingPlayerId?: string | null
  onRemovePlayer?: (playerId: string, playerName: string) => void
  playersLabel?: string
  /** When set, renders a "How to play" row linking to the game's rules. */
  gameType?: GameType | string | null
  /** Rendered first — e.g. the host-mode selector during the lobby. */
  top?: React.ReactNode
  settings?: React.ReactNode
  footer?: React.ReactNode
}) {
  const splitViewers = game.status === 'active'
  const participants = splitViewers ? players.filter((p) => !playerIsViewer(p, game)) : players
  const viewers = splitViewers ? players.filter((p) => playerIsViewer(p, game)) : []

  return (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {top}

      <HostLobbyPlayersSection
        players={participants}
        removingPlayerId={removingPlayerId}
        onRemovePlayer={onRemovePlayer}
        highlightPlayerId={highlightPlayerId}
        label={playersLabel}
      />

      {viewers.length > 0 && (
        <HostLobbyPlayersSection
          players={viewers}
          removingPlayerId={removingPlayerId}
          onRemovePlayer={onRemovePlayer}
          highlightPlayerId={highlightPlayerId}
          label="Viewers"
          tone="viewers"
          hint="Watching only"
        />
      )}

      {gameType && <HostRulesRow gameType={gameType} />}

      {settings}
      {footer}
    </div>
  )
}
