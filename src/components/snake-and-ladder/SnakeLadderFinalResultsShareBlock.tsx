'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { MEDALS } from '@/lib/medals'
import type { Game, Player, SnakeLadderPlayerState, SnakeLadderSession } from '@/types'
import { buildSnakeLadderStandings, SNAKE_LADDER_COLOR_LABELS } from '@/lib/snake-and-ladder'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'

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
            snakeLadderStandings={standings}
            snakeLadderWinnerName={displayWinner ?? undefined}
            snakeLadderEndedEarly={endedEarly}
          />
        }
      />
    </div>
  )
}
