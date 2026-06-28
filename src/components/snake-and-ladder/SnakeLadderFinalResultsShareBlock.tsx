'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import type { Game, Player, SnakeLadderPlayerState, SnakeLadderSession } from '@/types'
import { buildSnakeLadderStandings, SNAKE_LADDER_COLOR_LABELS } from '@/lib/snake-and-ladder'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'

export function SnakeLadderFinalResultsShareBlock({
  game,
  players,
  states,
  session,
  winnerName,
  highlightPlayerId,
  playAgainButton,
}: {
  game: Game
  players: Player[]
  states: SnakeLadderPlayerState[]
  session: SnakeLadderSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const standings = useMemo(
    () => buildSnakeLadderStandings(states, players, session?.winner_player_id),
    [states, players, session?.winner_player_id]
  )

  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner =
    winnerName ?? (winnerPlayerId ? players.find((p) => p.id === winnerPlayerId)?.name : null) ?? null
  const endedEarly = game.status === 'finished' && !displayWinner

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">{endedEarly ? '🏁' : '🏆'}</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">
          {displayWinner ? `${displayWinner} wins!` : endedEarly ? 'Game ended early' : 'Game over'}
        </p>
        {standings.length > 0 && (
          <div className="space-y-2 pt-2">
            {standings.map((row) => {
              const isWinner = winnerPlayerId ? row.playerId === winnerPlayerId : false
              const isMe = row.playerId === highlightPlayerId
              return (
                <div
                  key={row.playerId}
                  className={[
                    'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5',
                    isWinner
                      ? 'border-[color-mix(in_srgb,var(--marry)_45%,var(--border-strong))] bg-[color-mix(in_srgb,var(--marry)_10%,var(--surface-inset-bg))]'
                      : 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
                    isMe && !isWinner ? 'ring-1 ring-[color-mix(in_srgb,var(--primary)_25%,transparent)]' : '',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">
                      {isWinner ? '🏆 ' : `${row.rank}. `}
                      {row.name}
                      {isMe ? ' (you)' : ''}
                    </p>
                    <p className="text-[11px] text-muted">
                      {SNAKE_LADDER_COLOR_LABELS[row.color]} · square {row.position}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <HostGameFinishedActions
        playAgainButton={playAgainButton}
        shareButton={
          <ShareResults
            captureRef={captureRef}
            game={game}
            participants={[]}
            votes={[]}
            rounds={[]}
            players={players}
            snakeLadderStandings={standings}
            snakeLadderWinnerName={displayWinner ?? undefined}
            snakeLadderEndedEarly={endedEarly}
          />
        }
      />
    </div>
  )
}
