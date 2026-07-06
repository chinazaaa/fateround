'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { MEDALS } from '@/lib/medals'
import type { Game, MonopolyBoard, MonopolyPlayerState, Player } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { buildMonopolyStandings } from '@/lib/monopoly'
import { formatThemedMoney } from '@/components/monopoly/monopoly-themes'

export function MonopolyFinalResultsShareBlock({
  game,
  players,
  states,
  board,
  winnerName,
  highlightPlayerId,
  playAgainButton,
  themeId,
}: {
  game: Game
  players: Player[]
  states: MonopolyPlayerState[]
  board: MonopolyBoard | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  themeId?: string | null
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const standings = useMemo(
    () =>
      board
        ? buildMonopolyStandings(
            states,
            players,
            board.property_owners,
            board.property_buildings,
            board.mortgaged_properties
          )
        : [],
    [board, players, states]
  )

  const displayWinner = winnerName ?? standings.find((row) => row.rank === 1)?.name ?? null

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        <FinishedWinnerHero
          winnerName={displayWinner}
          game={game}
          subtitle={
            displayWinner && standings.length > 1 ? 'Highest total assets (cash + properties + buildings)' : undefined
          }
        />
        {standings.length > 0 && (
          <div className="space-y-2">
            {standings.map((row) => {
              const isWinner = row.rank === 1
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
                      {row.propertyCount} propert{row.propertyCount === 1 ? 'y' : 'ies'} · Cash{' '}
                      {formatThemedMoney(row.cash, themeId)}
                    </p>
                  </div>
                  <p
                    className={`ml-auto shrink-0 text-sm font-black tabular-nums ${
                      isWinner ? 'gradient-title' : 'text-[var(--primary)]'
                    }`}
                  >
                    {formatThemedMoney(row.netWorth, themeId)}
                  </p>
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
            monopolyStandings={standings}
            monopolyWinnerName={displayWinner ?? undefined}
          />
        }
      />
    </div>
  )
}
