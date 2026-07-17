'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, Player, PingPongSession } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'

export function PingPongFinalResultsShareBlock({
  game,
  players,
  session,
  winnerName,
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  players: Player[]
  session: PingPongSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const playerX = players.find((p) => p.id === session?.player_x_id)
  const playerO = players.find((p) => p.id === session?.player_o_id)
  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner =
    winnerName ?? (winnerPlayerId ? players.find((p) => p.id === winnerPlayerId)?.name : null) ?? null
  const endedEarly = game.status === 'finished' && !displayWinner

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        {endedEarly ? (
          <FinishedWinnerHero game={game} emoji="🏁" headline="Game ended early" />
        ) : (
          <FinishedWinnerHero winnerName={displayWinner} game={game} />
        )}
        {session && (
          <div className="space-y-3 rounded-xl bg-[var(--surface-inset-bg)] p-4 border border-[var(--border)]">
            <div className="flex items-center justify-between gap-3 text-sm px-1">
              <span className="font-bold text-sky-500 truncate">
                🏓 {playerX?.name ?? 'Player X'}
                {playerX?.id === highlightPlayerId ? ' (you)' : ''}
              </span>
              <span className="text-2xl font-black tabular-nums">
                {session.score_x} - {session.score_o}
              </span>
              <span className="font-bold text-orange-500 truncate text-right">
                🏓 {playerO?.name ?? 'Player O'}
                {playerO?.id === highlightPlayerId ? ' (you)' : ''}
              </span>
            </div>
            <p className="text-center text-xs text-muted font-medium">
              First to {session.points_to_win} points (win by 2)
            </p>
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
            primary
          />
        }
      />
    </div>
  )
}
