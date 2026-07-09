'use client'

import { useState } from 'react'
import { GameLobbyPlayerList } from '@/components/ui/GameLobbyPlayerList'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton, leaveButtonQuietClassName } from '@/components/ui/LeaveGameButton'
import { PlayerResumeCard } from '@/components/PlayerResumeCard'
import { WhatsAppChannelLink } from '@/components/WhatsAppChannelLink'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import type { Player } from '@/types'

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
  const gameCfg = gameType ? gameTypeConfig(parseGameType(gameType)) : null

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
      <div className="rounded-xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] px-4 py-4 text-center space-y-1">
        {isSpectator ? (
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
        {gameCfg && (
          <p className="flex items-center justify-center gap-1.5 pt-1 text-sm font-bold text-[var(--foreground)]">
            <span className="leading-none">{gameCfg.headerEmoji}</span>
            <span>{gameCfg.label}</span>
          </p>
        )}
        <div className="flex justify-center pt-2">
          <WhatsAppChannelLink />
        </div>
      </div>

      {activityFirst ? activity : null}

      {/* Lobby leads right after the header — players see who's in immediately. */}
      <GameLobbyPlayerList players={players} myPlayerId={myPlayerId} label={playerListLabel} />

      {activityFirst ? null : activity}

      {/* Compact footer: your identity, rules and the quieter continue / leave actions
          live down here so they don't crowd the lobby. */}
      {myPlayerId ? (
        <div className="space-y-2.5 border-t border-[var(--border)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <EditNameInline
              gameCode={gameCode}
              playerId={myPlayerId}
              currentName={myPlayerName}
              onRenamed={onRenamed}
            />
            {rulesLink ? <div className="shrink-0">{rulesLink}</div> : null}
          </div>
          <PlayerResumeCard gameCode={gameCode} />
          <LeaveGameButton
            gameCode={gameCode}
            playerId={myPlayerId}
            onLeft={onLeft}
            confirmTitle="Leave this lobby?"
            confirmMessage="You can rejoin with your player code if there is room."
            className={leaveButtonQuietClassName}
          />
        </div>
      ) : rulesLink ? (
        <div className="text-center">{rulesLink}</div>
      ) : null}
    </div>
  )
}
