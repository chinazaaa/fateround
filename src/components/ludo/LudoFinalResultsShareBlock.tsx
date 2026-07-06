'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { MEDALS } from '@/lib/medals'
import type { Game, LudoPlayerState, LudoSession, Player } from '@/types'
import { buildLudoStandings, LUDO_COLOR_LABELS } from '@/lib/ludo'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'

export function LudoFinalResultsShareBlock({
  game,
  players,
  states,
  session,
  winnerName,
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  players: Player[]
  states: LudoPlayerState[]
  session: LudoSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const standings = useMemo(
    () => buildLudoStandings(states, players, session?.winner_player_id),
    [states, players, session?.winner_player_id]
  )

  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner =
    winnerName ?? (winnerPlayerId ? players.find((p) => p.id === winnerPlayerId)?.name : null) ?? null
  const endedEarly = game.status === 'finished' && !displayWinner

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        {endedEarly ? (
          <FinishedWinnerHero winnerName={null} game={game} emoji="🏁" headline="Game ended early" />
        ) : (
          <FinishedWinnerHero winnerName={displayWinner} game={game} />
        )}
        {standings.length > 0 && (
          <div className="space-y-2">
            {standings.map((row) => {
              const isWinner = winnerPlayerId ? row.playerId === winnerPlayerId : false
              const isMe = row.playerId === highlightPlayerId
              return (
                <div
                  key={row.playerId}
                  className={
                    isWinner
                      ? 'flex items-center gap-3 rounded-xl px-4 py-3 border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))]'
                      : 'flex items-center gap-3 rounded-xl px-4 py-3 border border-[var(--border)] bg-[var(--surface-inset-bg)]'
                  }
                >
                  <span
                    className={`w-7 shrink-0 text-center font-black tabular-nums ${
                      isWinner ? 'text-lg gradient-title' : 'text-base text-faint'
                    }`}
                  >
                    {MEDALS[row.rank - 1] ?? row.rank}
                  </span>
                  <div className="min-w-0">
                    <p className={`font-bold truncate ${isWinner ? 'text-[17px]' : 'text-[15px]'}`}>
                      {row.name}
                      {isMe ? <span className="label-teal font-semibold"> (you)</span> : null}
                    </p>
                    <p className="text-[11px] text-muted">
                      {LUDO_COLOR_LABELS[row.color]} · {row.finishedCount}/4 home
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <HostGameFinishedActions
        variant="winner"
        gameCode={game.id}
        playAgainButton={playAgainButton}
        returnToLobbyButton={returnToLobbyButton}
        lobbyNote={lobbyNote}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            ludoStandings={standings}
            ludoWinnerName={displayWinner ?? undefined}
            ludoEndedEarly={endedEarly}
            primary
          />
        }
      />
    </div>
  )
}
