'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import type { Game, Player, ScrabbleSession, ScrabblePlayerState } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'

export function ScrabbleFinalResultsShareBlock({
  game,
  players,
  session,
  playerStates,
  winnerName,
  highlightPlayerId,
  playAgainButton,
}: {
  game: Game
  players: Player[]
  session: ScrabbleSession | null
  playerStates: ScrabblePlayerState[]
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
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
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">{isTie ? '🤝' : endedEarly ? '🏁' : '🏆'}</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">
          {isTie
            ? "It's a tie!"
            : displayWinner
              ? `${displayWinner} wins!`
              : endedEarly
                ? 'Game ended early'
                : 'Game over'}
        </p>
        {standings.length > 0 && (
          <div className="space-y-1.5">
            {standings.map((s, i) => (
              <div
                key={s.playerId}
                className={[
                  'flex items-center justify-between rounded-lg px-3 py-2 text-sm border',
                  s.playerId === highlightPlayerId
                    ? 'border-[var(--primary)]/50 bg-[var(--primary)]/10'
                    : 'border-[var(--border)] bg-[var(--surface-inset-bg)]',
                ].join(' ')}
              >
                <span className="font-bold truncate">
                  <span className="text-faint mr-1.5">{i + 1}.</span>
                  {s.name}
                  {s.playerId === highlightPlayerId && <span className="text-faint font-normal"> (you)</span>}
                </span>
                <span className="tabular-nums font-black">{s.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <HostGameFinishedActions
        gameCode={game.id}
        playAgainButton={playAgainButton}
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
