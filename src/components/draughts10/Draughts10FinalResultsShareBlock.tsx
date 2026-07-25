'use client'

import { useRef, type ReactNode } from 'react'
import type { Game, Player, Draughts10Session } from '@/types'
import { draughts10ResultDetail, colorOfPiece } from '@/lib/draughts10'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'
import { FinishedWinnerHero } from '@/components/FinishedWinner'

const LIGHT_SQUARE = '#e8d3ab'
const DARK_SQUARE = '#9c6b3f'
const RC = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

function ReadOnlyBoard({ board }: { board: string }) {
  return (
    <div className="grid grid-cols-10 max-w-[260px] mx-auto w-full rounded-md overflow-hidden border-2 border-[var(--border-strong)]">
      {RC.map((row) =>
        RC.map((col) => {
          const dark = (row + col) % 2 === 1
          const piece = dark ? board[row * 10 + col] : '.'
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

export function Draughts10FinalResultsShareBlock({
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
  session: Draughts10Session | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
  returnToLobbyButton?: ReactNode
  lobbyNote?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const red = players.find((p) => p.id === session?.player_red_id)
  const black = players.find((p) => p.id === session?.player_black_id)
  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner =
    winnerName ?? (winnerPlayerId ? players.find((p) => p.id === winnerPlayerId)?.name : null) ?? null
  const isDraw = session?.is_draw === true
  const endedEarly = game.status === 'finished' && !displayWinner && !isDraw
  const resultDetail = draughts10ResultDetail(session?.result_reason)

  return (
    <div className="space-y-4">
      <div ref={captureRef} className="glass-card-strong p-6 sm:p-8 space-y-5">
        <ShareResultsCaptureHeader game={game} />
        {isDraw ? (
          <FinishedWinnerHero
            game={game}
            emoji="🤝"
            headline="It's a draw!"
            subtitle={resultDetail ? <span className="capitalize">{resultDetail}</span> : undefined}
          />
        ) : endedEarly ? (
          <FinishedWinnerHero game={game} emoji="🏁" headline="Game ended early" />
        ) : (
          <FinishedWinnerHero
            winnerName={displayWinner}
            game={game}
            subtitle={resultDetail ? <span className="capitalize">{resultDetail}</span> : undefined}
          />
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
            ticTacToeWinnerName={displayWinner ?? undefined}
            ticTacToeIsDraw={isDraw}
            ticTacToeEndedEarly={endedEarly}
            primary
          />
        }
      />
    </div>
  )
}
