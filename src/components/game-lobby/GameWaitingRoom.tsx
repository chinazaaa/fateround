'use client'

import { useState } from 'react'
import { GameLobbyPlayerList } from '@/components/ui/GameLobbyPlayerList'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import type { GameType } from '@/types'

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
  spectating = false,
  onRenamed,
  onLeft,
  onReady,
  title = 'Waiting for the host to start',
  subtitle = 'The game will begin shortly',
  minPlayers,
}: {
  gameCode: string
  players: Parameters<typeof GameLobbyPlayerList>[0]['players']
  myPlayerId: string
  myPlayerName: string
  gameType?: GameType | string
  /** Show "Watching as" + a ready-to-play button for a spectator waiting to join. */
  spectating?: boolean
  onRenamed: (name: string) => void
  onLeft: () => void
  /** When set (spectator who can join), renders the "I'm in — ready to play" button. */
  onReady?: () => void | Promise<void>
  title?: string
  subtitle?: string
  minPlayers?: number
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
        {spectating && onReady ? (
          <button
            type="button"
            onClick={() => void handleReady()}
            disabled={readying}
            className="btn-primary mt-4 w-full py-3 text-base font-bold sm:w-auto sm:px-8"
          >
            {readying ? 'Joining…' : "I'm in — ready to play"}
          </button>
        ) : null}
      </div>

      {/* Who's already here. */}
      <GameLobbyPlayerList players={players} myPlayerId={myPlayerId} label="In lobby" minPlayers={minPlayers} />

      {/* Identity + leave, shown ONCE. The "continue on another device" code now
          lives in the header Share popup ("Your player link"), so it's hidden here. */}
      <div className="border-t border-[var(--border)] pt-4">
        <PlayerSessionControls
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myPlayerName}
          onRenamed={onRenamed}
          onLeft={onLeft}
          inLobby
          spectating={spectating}
          hideResume
        />
      </div>
    </div>
  )
}
