'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { MEDALS } from '@/lib/medals'
import type { Game, Player, ScrabbleSession, ScrabblePlayerState } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'

export function ScrabbleFinalResultsShareBlock({
  game,
  players,
  session,
  playerStates,
  winnerName,
  highlightPlayerId,
  playAgainButton,
  returnToLobbyButton,
  lobbyNote,
}: {
  game: Game
  players: Player[]
  session: ScrabbleSession | null
  playerStates: ScrabblePlayerState[]
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner =
    winnerName ?? (winnerPlayerId ? players.find((p) => p.id === winnerPlayerId)?.name : null) ?? null
  const isTie = session?.is_tie === true
  const endedEarly = game.status === 'finished' && !displayWinner && !isTie

  // Leaderboard: every player with a state row, scores high to low.
  const standings = useMemo(() => {
    return playerStates
      .map((s) => ({
        playerId: s.player_id,
        name: players.find((p) => p.id === s.player_id)?.name ?? 'Player',
        score: s.score,
      }))
      .sort((a, b) => b.score - a.score)
  }, [playerStates, players])

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero
          winnerName={isTie || endedEarly ? undefined : displayWinner}
          game={game}
          emoji={isTie ? '🤝' : endedEarly ? '🏁' : '🏆'}
          headline={isTie ? "It's a tie!" : endedEarly ? 'Game ended early' : undefined}
        />
        {standings.length > 0 && (
          <div className="space-y-2">
            {standings.map((s, i) => {
              const rank = i + 1
              const isWinner = rank === 1
              const isMe = s.playerId === highlightPlayerId
              return (
                <div
                  key={s.playerId}
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
                    {MEDALS[rank - 1] ?? rank}
                  </span>
                  <div className="min-w-0">
                    <p className={`font-bold truncate ${isWinner ? 'text-[17px]' : 'text-[15px]'}`}>
                      {s.name}
                      {isMe ? <span className="label-teal font-semibold"> (you)</span> : null}
                    </p>
                  </div>
                  <p
                    className={`ml-auto shrink-0 text-sm font-black tabular-nums ${
                      isWinner ? 'gradient-title' : 'text-muted'
                    }`}
                  >
                    {s.score}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <HostGameFinishedActions
        variant={returnToLobbyButton ? 'winner' : 'default'}
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
            ticTacToeWinnerName={displayWinner ?? undefined}
            ticTacToeIsDraw={isTie}
            ticTacToeEndedEarly={endedEarly}
          />
        }
      />
    </div>
  )
}
