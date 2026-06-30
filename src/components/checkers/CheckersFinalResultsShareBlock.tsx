'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, Player, CheckersSession } from '@/types'
import { checkersResultDetail, colorOfPiece } from '@/lib/checkers'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'

const LIGHT_SQUARE = '#e8d3ab'
const DARK_SQUARE = '#9c6b3f'
const RC = [0, 1, 2, 3, 4, 5, 6, 7] as const

function ReadOnlyBoard({ board }: { board: string }) {
  return (
    <div className="grid grid-cols-8 max-w-[260px] mx-auto w-full rounded-md overflow-hidden border-2 border-[var(--border-strong)]">
      {RC.map((row) =>
        RC.map((col) => {
          const dark = (row + col) % 2 === 1
          const piece = dark ? board[row * 8 + col] : '.'
          const color = colorOfPiece(piece)
          const king = piece === 'R' || piece === 'B'
          return (
            <div
              key={`${row}${col}`}
              className="aspect-square flex items-center justify-center"
              style={{ backgroundColor: dark ? DARK_SQUARE : LIGHT_SQUARE }}
            >
              {color && (
                <span
                  className="flex items-center justify-center rounded-full w-[78%] h-[78%]"
                  style={{
                    background: color === 'r' ? '#dc2626' : '#1f2937',
                    boxShadow: `inset 0 0 0 2px ${color === 'r' ? '#7f1d1d' : '#000'}`,
                  }}
                >
                  {king && <span className="text-amber-300 text-[0.8em] leading-none">♔</span>}
                </span>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

export function CheckersFinalResultsShareBlock({
  game,
  players,
  session,
  winnerName,
  highlightPlayerId,
  playAgainButton,
}: {
  game: Game
  players: Player[]
  session: CheckersSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const red = players.find((p) => p.id === session?.player_red_id)
  const black = players.find((p) => p.id === session?.player_black_id)
  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner =
    winnerName ?? (winnerPlayerId ? players.find((p) => p.id === winnerPlayerId)?.name : null) ?? null
  const isDraw = session?.is_draw === true
  const endedEarly = game.status === 'finished' && !displayWinner && !isDraw
  const resultDetail = checkersResultDetail(session?.result_reason)

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
        {resultDetail && !endedEarly && (
          <p className="text-sm text-center text-faint -mt-2 capitalize">{resultDetail}</p>
        )}
        {session && (
          <>
            <div className="flex items-center justify-between gap-3 text-sm px-1">
              <span className="font-bold truncate">
                🔴 {red?.name ?? 'Red'}
                {red?.id === highlightPlayerId ? ' (you)' : ''}
              </span>
              <span className="text-faint shrink-0">vs</span>
              <span className="font-bold truncate text-right">
                ⚫ {black?.name ?? 'Black'}
                {black?.id === highlightPlayerId ? ' (you)' : ''}
              </span>
            </div>
            <ReadOnlyBoard board={session.board} />
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
