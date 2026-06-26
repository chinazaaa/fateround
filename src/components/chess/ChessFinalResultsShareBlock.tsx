'use client'

import { useMemo, useRef, type ReactNode } from 'react'
import { Chess, type Square } from 'chess.js'
import type { ChessColor, Game, Player, ChessSession } from '@/types'
import { chessResultDetail } from '@/lib/chess'
import { HostGameFinishedActions } from '@/components/host/HostGameFinishedActions'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareResults } from '@/components/ShareResults'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const
const GLYPH: Record<string, string> = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' }

function ReadOnlyBoard({ fen }: { fen: string }) {
  const chess = useMemo(() => {
    const c = new Chess()
    try {
      c.load(fen)
    } catch {
      // keep starting position
    }
    return c
  }, [fen])

  return (
    <div className="grid grid-cols-8 max-w-[260px] mx-auto w-full rounded-md overflow-hidden border-2 border-[var(--border-strong)]">
      {RANKS.map((rank) =>
        FILES.map((file) => {
          const square = `${file}${rank}`
          const piece = chess.get(square as Square)
          const isLight = (FILES.indexOf(file) + rank) % 2 === 1
          return (
            <div
              key={square}
              className={[
                'aspect-square flex items-center justify-center',
                isLight ? 'bg-[#eed9b5]' : 'bg-[#b58863]',
              ].join(' ')}
            >
              {piece && (
                <span
                  className="text-[3.4vw] sm:text-base leading-none"
                  style={{ color: (piece.color as ChessColor) === 'w' ? '#f8fafc' : '#1e293b' }}
                >
                  {GLYPH[piece.type]}
                </span>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

export function ChessFinalResultsShareBlock({
  game,
  players,
  session,
  winnerName,
  highlightPlayerId,
  playAgainButton,
}: {
  game: Game
  players: Player[]
  session: ChessSession | null
  winnerName?: string | null
  highlightPlayerId?: string | null
  playAgainButton?: ReactNode
}) {
  const captureRef = useRef<HTMLDivElement>(null)

  const white = players.find((p) => p.id === session?.player_white_id)
  const black = players.find((p) => p.id === session?.player_black_id)
  const winnerPlayerId = session?.winner_player_id ?? null
  const displayWinner =
    winnerName ?? (winnerPlayerId ? players.find((p) => p.id === winnerPlayerId)?.name : null) ?? null
  const isDraw = session?.is_draw === true
  const endedEarly = game.status === 'finished' && !displayWinner && !isDraw
  const resultDetail = chessResultDetail(session?.result_reason)

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
                ♔ {white?.name ?? 'White'}
                {white?.id === highlightPlayerId ? ' (you)' : ''}
              </span>
              <span className="text-faint shrink-0">vs</span>
              <span className="font-bold truncate text-right">
                ♚ {black?.name ?? 'Black'}
                {black?.id === highlightPlayerId ? ' (you)' : ''}
              </span>
            </div>
            <ReadOnlyBoard fen={session.fen} />
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
