'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import type { Game, Player, WhotPlayerHand, WhotSession } from '@/types'
import { gameTypeConfig } from '@/lib/game-types'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { ShareResults } from '@/components/ShareResults'
import { buildWhotStandings } from '@/lib/whot'

export function WhotFinalResultsShareBlock({
  game,
  players,
  hands,
  session,
  winnerName,
  highlightPlayerId,
  playAgainButton,
}: {
  game: Game
  players: Player[]
  hands: WhotPlayerHand[]
  session: WhotSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)
  const cfg = gameTypeConfig('whot')

  const standings = useMemo(
    () => buildWhotStandings(hands, players, session?.turn_order ?? []),
    [hands, players, session?.turn_order]
  )

  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner =
    winnerName ?? standings.find((row) => row.rank === 1)?.name ?? null

  const winnerStanding =
    (winnerPlayerId ? standings.find((row) => row.playerId === winnerPlayerId) : null) ??
    standings.find((row) => row.rank === 1) ??
    null
  const winnerEmptyHand = winnerStanding?.cardCount === 0

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <div className="text-center space-y-2">
          <p className="text-3xl sm:text-4xl leading-none">{cfg.headerEmoji}</p>
          <p className="text-2xl sm:text-3xl font-black gradient-title">{game.title}</p>
          <p className="text-muted text-xs uppercase tracking-wider">Final results</p>
        </div>
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">🏆</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">
          {displayWinner ? `${displayWinner} wins!` : 'Game over'}
        </p>
        {session?.status_message && (
          <p className="text-center text-xs text-muted max-w-sm mx-auto">{session.status_message}</p>
        )}
        {standings.length > 1 && (
          <p className="text-center text-xs text-muted">
            {winnerEmptyHand
              ? 'First to empty their hand wins'
              : 'Lowest hand total wins (WHOT = 20)'}
          </p>
        )}
        {standings.length > 0 && (
          <div className="space-y-2 pt-2">
            {standings.map((row) => {
              const isWinner = winnerPlayerId
                ? row.playerId === winnerPlayerId
                : row.rank === 1
              const isMe = row.playerId === highlightPlayerId
              return (
                <div
                  key={row.playerId}
                  className={[
                    'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5',
                    isWinner
                      ? 'border-[color-mix(in_srgb,var(--marry)_45%,var(--border-strong))] bg-[color-mix(in_srgb,var(--marry)_10%,var(--surface-inset-bg))]'
                      : 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
                    isMe && !isWinner
                      ? 'ring-1 ring-[color-mix(in_srgb,var(--primary)_25%,transparent)]'
                      : '',
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">
                      {isWinner ? '🏆 ' : `${row.rank}. `}
                      {row.name}
                      {isMe ? ' (you)' : ''}
                    </p>
                    <p className="text-[11px] text-muted">
                      {row.cardCount === 0
                        ? 'Out of cards'
                        : `${row.cardCount} card${row.cardCount === 1 ? '' : 's'} left`}
                    </p>
                  </div>
                  <p className="text-sm font-black tabular-nums text-[var(--primary)] shrink-0">
                    {row.cardCount === 0 ? '—' : row.handSum}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <ShareResults
        captureRef={captureRef}
        game={game}
        participants={[]}
        votes={[]}
        rounds={[]}
        players={players}
        whotStandings={standings}
        whotWinnerName={displayWinner ?? undefined}
      />
      {playAgainButton}
      <CreateNewGameButton />
    </div>
  )
}
