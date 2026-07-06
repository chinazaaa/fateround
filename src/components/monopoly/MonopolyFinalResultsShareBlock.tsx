'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import type { Game, MonopolyBoard, MonopolyPlayerState, Player } from '@/types'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
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
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">🏆</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">
          {displayWinner ? `${displayWinner} wins!` : 'Game over'}
        </p>
        {displayWinner && standings.length > 1 && (
          <p className="text-center text-xs text-muted">Highest total assets (cash + properties + buildings)</p>
        )}
        {standings.length > 0 && (
          <div className="space-y-2 pt-2">
            {standings.map((row) => {
              const isWinner = row.rank === 1
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
                      {row.propertyCount} propert{row.propertyCount === 1 ? 'y' : 'ies'} · Cash{' '}
                      {formatThemedMoney(row.cash, themeId)}
                    </p>
                  </div>
                  <p className="text-sm font-black tabular-nums text-[var(--primary)] shrink-0">
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
