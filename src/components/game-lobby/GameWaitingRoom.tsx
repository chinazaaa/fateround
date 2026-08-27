'use client'

import { useState } from 'react'
import { GameLobbyPlayerList } from '@/components/ui/GameLobbyPlayerList'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import type { Game, GameType } from '@/types'

/**
 * The shared "waiting for the host to start" room for standard games (not team /
 * poll games, which have their own lobby activities). One clear hero message, the
 * lobby roster, then a single compact identity/actions footer — so nothing (like
 * "Playing as …") is repeated. Render this while `game.status === 'waiting'`
 * INSTEAD of the game's active board, so the two don't both show a waiting state.
 *
 * The page header (game emoji/title) stays with the caller — this component is
 * just the waiting body.
 */
export function GameWaitingRoom({
  gameCode,
  players,
  myPlayerId,
  myPlayerName,
  gameType,
  game,
  spectating = false,
  onRenamed,
  onLeft,
  onReady,
  seatAvailable = true,
  title = 'Waiting for the host to start',
  subtitle = 'The game will begin shortly',
  minPlayers,
  children,
}: {
  gameCode: string
  players: Parameters<typeof GameLobbyPlayerList>[0]['players']
  myPlayerId: string
  myPlayerName: string
  gameType?: GameType | string
  /** When set, renders the same settings pills shown on the join screen — so a player who
   *  joined without reading closely can still see what they signed up for. */
  game?: Game | null
  /** Show "Watching as" + a ready-to-play button for a spectator waiting to join. */
  spectating?: boolean
  onRenamed: (name: string) => void
  onLeft: () => void
  /** When set (spectator who can join), renders the "I'm in — ready to play" button. */
  onReady?: () => void | Promise<void>
  /**
   * Whether the room currently has an open seat for a spectator promotion. When false the
   * ready button is greyed out and the copy explains why — a spectator who joined into a
   * full room shouldn't see an armed button, only for the click to fail (that read like a
   * broken control). Defaults to `true` for back-compat with callers that don't check.
   */
  seatAvailable?: boolean
  title?: string
  subtitle?: string
  minPlayers?: number
  /**
   * Game-specific lobby content — e.g. a team picker ("pick a team"), a card the
   * host set up, etc. Rendered between the hero and the roster so team games can
   * reuse this same room instead of building their own. Omit for plain games.
   */
  children?: React.ReactNode
}) {
  const [readying, setReadying] = useState(false)

  const handleReady = async () => {
    if (!onReady || readying) return
    setReadying(true)
    try {
      await onReady()
    } finally {
      setReadying(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Rules up top — near the game title, not buried at the bottom. */}
      {gameType ? (
        <p className="text-center">
          <GameRulesLink gameType={gameType} variant="subtle" />
        </p>
      ) : null}

      {/* Hero — the single, clear "what's happening" message. */}
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] px-6 py-8 text-center">
        <span className="relative mx-auto mb-4 flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--primary)]" />
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-body">{title}</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        {game ? <GameInfoChips game={game} className="pt-3" /> : null}
        {spectating && onReady ? (
          <>
            <button
              type="button"
              onClick={() => void handleReady()}
              disabled={readying || !seatAvailable}
              className="btn-primary mt-4 w-full py-3 text-base font-bold sm:w-auto sm:px-8 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {readying ? 'Joining…' : !seatAvailable ? 'Room is full — waiting for a seat' : "I'm in — ready to play"}
            </button>
            {!seatAvailable && (
              <p className="mt-2 text-xs text-muted">A seat will free up if someone leaves before the host starts.</p>
            )}
          </>
        ) : null}
      </div>

      {/* Game-specific lobby content (e.g. a team picker) slots in here. */}
      {children}

      {/* Who's already here. */}
      <GameLobbyPlayerList players={players} myPlayerId={myPlayerId} label="In lobby" minPlayers={minPlayers} />
    </div>
  )
}
