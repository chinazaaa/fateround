'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, Player, TicTacToeBoardResult, TicTacToeSession } from '@/types'
import { checkOverallWinner, subBoardCells } from '@/lib/tic-tac-toe'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'

function glyph(value: string | null): string {
  return value === 'X' ? '✕' : value === 'O' ? '○' : ''
}

function ReadOnlyBoard({ board, boardWinners }: { board: ('X' | 'O' | null)[]; boardWinners: TicTacToeBoardResult[] }) {
  const win = checkOverallWinner(boardWinners)
  const winLine = new Set(win?.line ?? [])

  return (
    <div className="grid grid-cols-3 gap-1.5 max-w-[240px] mx-auto w-full">
      {Array.from({ length: 9 }, (_, boardIndex) => {
        const result = boardWinners[boardIndex] ?? null
        const cells = subBoardCells(board, boardIndex)
        return (
          <div
            key={boardIndex}
            className={[
              'relative rounded-lg border-2 p-0.5',
              winLine.has(boardIndex) ? 'border-amber-400 bg-amber-400/15' : 'border-[var(--border-strong)]',
            ].join(' ')}
          >
            <div className="grid grid-cols-3 gap-px">
              {cells.map((value, pos) => (
                <div
                  key={pos}
                  className={[
                    'aspect-square flex items-center justify-center text-[10px] font-black bg-[var(--surface-inset-bg)] rounded-sm',
                    result ? 'opacity-30' : '',
                    value === 'X' ? 'text-sky-500' : value === 'O' ? 'text-orange-500' : '',
                  ].join(' ')}
                >
                  {glyph(value)}
                </div>
              ))}
            </div>
            {result && (
              <div className="absolute inset-0 flex items-center justify-center">
                {result === 'draw' ? (
                  <span className="text-base">🤝</span>
                ) : (
                  <span
                    className={['text-2xl font-black', result === 'X' ? 'text-sky-500' : 'text-orange-500'].join(' ')}
                  >
                    {glyph(result)}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function TicTacToeFinalResultsShareBlock({
  game,
  players,
  session,
  winnerName,
  highlightPlayerId,
  playAgainButton,
}: {
  game: Game
  players: Player[]
  session: TicTacToeSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const playerX = players.find((p) => p.id === session?.player_x_id)
  const playerO = players.find((p) => p.id === session?.player_o_id)
  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner =
    winnerName ?? (winnerPlayerId ? players.find((p) => p.id === winnerPlayerId)?.name : null) ?? null
  const isDraw = session?.is_draw === true
  const endedEarly = game.status === 'finished' && !displayWinner && !isDraw

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-4">
        <ShareResultsCaptureHeader game={game} />
        <p className="text-5xl sm:text-6xl leading-none text-center pt-1">{isDraw ? '🤝' : endedEarly ? '🏁' : '🏆'}</p>
        <p className="text-xl sm:text-2xl font-black text-center text-[var(--marry)]">
          {isDraw
            ? "It's a draw!"
            : displayWinner
              ? `${displayWinner} wins!`
              : endedEarly
                ? 'Game ended early'
                : 'Game over'}
        </p>
        {session && (
          <>
            <div className="flex items-center justify-between gap-3 text-sm px-1">
              <span className="font-bold text-sky-500 truncate">
                ✕ {playerX?.name ?? 'Player 1'}
                {playerX?.id === highlightPlayerId ? ' (you)' : ''}
              </span>
              <span className="text-faint shrink-0">vs</span>
              <span className="font-bold text-orange-500 truncate text-right">
                ○ {playerO?.name ?? 'Player 2'}
                {playerO?.id === highlightPlayerId ? ' (you)' : ''}
              </span>
            </div>
            <ReadOnlyBoard board={session.board as ('X' | 'O' | null)[]} boardWinners={session.board_winners ?? []} />
          </>
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
            ticTacToeWinnerName={displayWinner ?? undefined}
            ticTacToeIsDraw={isDraw}
            ticTacToeEndedEarly={endedEarly}
          />
        }
      />
    </div>
  )
}
