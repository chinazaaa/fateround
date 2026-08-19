'use client'

import { useState } from 'react'
import { GameLobbyPlayerList } from '@/components/ui/GameLobbyPlayerList'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { gameIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { lobbyHasOpenPlayerSeat } from '@/lib/game-limits'
import type { Game, Player } from '@/types'

type Props = {
  gameCode: string
  players: Player[]
  myPlayerId: string | null
  myPlayerName: string
  onRenamed: (name: string) => void
  onLeft: () => void
  title?: string
  /** Game type (e.g. game.game_type) — shows the game's name + emoji so players know what they joined. */
  gameType?: string
  /** Full game row — surfaces theme / difficulty / time chips so players know what they're joining. */
  game?: Game | null
  /** Game row used ONLY to compute the seat cap (game_type + max_players). Lets the panel tell
   *  when the lobby is full so a spectator sees a "watching" state instead of a dead ready button.
   *  Separate from `game` so passing it doesn't also render the info chips. */
  capacityGame?: Pick<Game, 'game_type' | 'max_players'> | null
  description?: React.ReactNode
  rulesLink?: React.ReactNode
  activity?: React.ReactNode
  /** Render the activity above the session controls + player list (e.g. team picker first). */
  activityFirst?: boolean
  playerListLabel?: string
  isSpectator?: boolean
  onReady?: () => Promise<void>
  onReadyError?: (message: string) => void
}

export function GameLobbyWaitingPanel({
  gameCode,
  players,
  myPlayerId,
  myPlayerName,
  onRenamed,
  onLeft,
  title = 'Waiting for host',
  gameType,
  game,
  capacityGame,
  description,
  rulesLink,
  activity,
  activityFirst = false,
  playerListLabel = 'In lobby',
  isSpectator = false,
  onReady,
  onReadyError,
}: Props) {
  const [readying, setReadying] = useState(false)
  const parsedGameType = gameType ? parseGameType(gameType) : null
  const gameCfg = parsedGameType ? gameTypeConfig(parsedGameType) : null
  // A spectator can only ready up if a seat is actually open. When the lobby is full
  // (all seats taken by ready players), they stay a watcher — hide the ready button and
  // label them "watching" rather than "not ready". Needs the full `game` row for the cap;
  // without it we can't tell, so we assume a seat is available (button shown, as before).
  const seatsFull = capacityGame ? !lobbyHasOpenPlayerSeat(capacityGame, players) : false

  const handleReady = async () => {
    if (!onReady || readying) return
    setReadying(true)
    try {
      await onReady()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong — try again'
      onReadyError?.(message)
    } finally {
      setReadying(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Rules up top — near the game title, not buried in the footer. */}
      {rulesLink ? <div className="text-center">{rulesLink}</div> : null}

      <div className="rounded-xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] px-4 py-4 text-center space-y-1">
        {isSpectator && seatsFull ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Watching</p>
            <h2 className="text-xl sm:text-2xl font-black">{title}</h2>
            <p className="text-muted text-sm">The game is full — you&apos;re watching this round.</p>
          </>
        ) : isSpectator ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">New round</p>
            <h2 className="text-xl sm:text-2xl font-black">{title}</h2>
            <p className="text-muted text-sm">Tap below to join the next round</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleReady}
                disabled={readying}
                className="btn-primary w-full py-3 text-base font-bold"
              >
                {readying ? 'Joining…' : "I'm in — ready to play"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">You&apos;re in</p>
            <h2 className="text-xl sm:text-2xl font-black">{title}</h2>
            {description ? <div className="text-muted text-sm leading-relaxed">{description}</div> : null}
          </>
        )}
        {gameCfg && parsedGameType && (
          <p className="flex items-center justify-center gap-1.5 pt-1 text-xs font-semibold text-muted">
            <span className="inline-flex items-center text-[var(--primary)] shrink-0">
              <Glyph icon={gameIcon(parsedGameType)} size={12} />
            </span>
            <span>{gameCfg.label}</span>
          </p>
        )}
        {game ? <GameInfoChips game={game} className="pt-1" /> : null}
      </div>

      {activityFirst ? activity : null}

      {/* Lobby leads right after the header — players see who's in immediately. */}
      <GameLobbyPlayerList
        players={players}
        myPlayerId={myPlayerId}
        label={playerListLabel}
        spectatorLabel={seatsFull ? 'watching' : 'not ready'}
      />

      {activityFirst ? null : activity}
    </div>
  )
}
