'use client'

import { useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { chessResultDetail, colorForPlayer, currentTurnPlayerId } from '@/lib/chess'
import type { ChessColor, Player, ChessSession } from '@/types'
import type { ChessClockState } from '@/hooks/useChessClocks'
import { ChessCard, ChessTurnBar } from '@/components/chess/ChessChrome'

/** Format remaining clock ms as m:ss (always reads as a clock, e.g. 10:00, 0:14, 0:05). */
function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const

const GLYPH: Record<string, string> = {
  p: '♟',
  r: '♜',
  n: '♞',
  b: '♝',
  q: '♛',
  k: '♚',
}

const PROMOTION_PIECES: { piece: 'q' | 'r' | 'b' | 'n'; label: string }[] = [
  { piece: 'q', label: '♛ Queen' },
  { piece: 'r', label: '♜ Rook' },
  { piece: 'b', label: '♝ Bishop' },
  { piece: 'n', label: '♞ Knight' },
]

const CAPTURABLE_TYPES = ['q', 'r', 'b', 'n', 'p'] as const
const STARTING_COUNT: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 }

type Material = {
  /** Black pieces removed from the board — i.e. captured by White. */
  capturedByWhite: string[]
  /** White pieces removed from the board — i.e. captured by Black. */
  capturedByBlack: string[]
}

function computeMaterial(chess: Chess): Material {
  const counts: Record<ChessColor, Record<string, number>> = {
    w: { q: 0, r: 0, b: 0, n: 0, p: 0 },
    b: { q: 0, r: 0, b: 0, n: 0, p: 0 },
  }
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type !== 'k') counts[cell.color][cell.type] += 1
    }
  }

  const capturedByWhite: string[] = []
  const capturedByBlack: string[] = []

  for (const type of CAPTURABLE_TYPES) {
    // Promotions can leave more than the starting count; clamp at 0.
    const missingBlack = Math.max(0, STARTING_COUNT[type] - counts.b[type])
    const missingWhite = Math.max(0, STARTING_COUNT[type] - counts.w[type])
    for (let i = 0; i < missingBlack; i += 1) capturedByWhite.push(type)
    for (let i = 0; i < missingWhite; i += 1) capturedByBlack.push(type)
  }

  return { capturedByWhite, capturedByBlack }
}

/** A player's row: name, captured opponent pieces, and clock. */
function CapturedTray({
  name,
  pieces,
  glyphColor,
  clockMs,
  clockActive,
}: {
  name: string
  pieces: string[]
  glyphColor: ChessColor
  clockMs?: number | null
  clockActive?: boolean
}) {
  const lowTime = clockMs != null && clockMs <= 30000
  return (
    <div className="flex items-center gap-1.5 min-h-[1.75rem] px-1">
      <span className="text-xs font-bold shrink-0">{glyphColor === 'w' ? '♚' : '♔'} {name}</span>
      <div className="flex items-center flex-wrap gap-0.5 leading-none">
        {pieces.map((type, i) => (
          <span
            key={`${type}-${i}`}
            className="text-xl sm:text-2xl leading-none"
            style={{
              color: glyphColor === 'w' ? '#f8fafc' : '#1e293b',
              textShadow:
                glyphColor === 'w'
                  ? '0 0 1px #0f172a, 0 1px 1px rgba(0,0,0,0.55)'
                  : '0 0 1px #f8fafc, 0 1px 1px rgba(255,255,255,0.4)',
            }}
          >
            {GLYPH[type]}
          </span>
        ))}
      </div>
      {clockMs != null && (
        <span
          className={[
            'ml-auto shrink-0 tabular-nums font-black rounded-md px-2 py-0.5 text-sm border',
            clockActive
              ? lowTime
                ? 'bg-rose-500/20 border-rose-400 text-rose-300 animate-pulse'
                : 'bg-[var(--primary)]/15 border-[var(--primary)]/50 text-[var(--foreground)]'
              : 'bg-[var(--surface-inset-bg)] border-[var(--border)] text-muted',
          ].join(' ')}
        >
          {formatClock(clockMs)}
        </span>
      )}
    </div>
  )
}

function Piece({ type, color }: { type: string; color: ChessColor }) {
  return (
    <span
      className="select-none leading-none text-[7.5vw] sm:text-[2.4rem]"
      style={{
        color: color === 'w' ? '#f8fafc' : '#1e293b',
        textShadow:
          color === 'w'
            ? '0 0 1px #0f172a, 0 1px 2px rgba(0,0,0,0.45)'
            : '0 0 1px #f8fafc, 0 1px 2px rgba(0,0,0,0.35)',
      }}
    >
      {GLYPH[type]}
    </span>
  )
}

export function ChessGamePanel({
  session,
  players,
  myPlayerId,
  isMyTurn,
  clocks,
  timeControlSeconds,
  onMove,
  onResign,
  acting,
}: {
  session: ChessSession
  players: Player[]
  myPlayerId: string | null
  isMyTurn: boolean
  clocks?: ChessClockState
  timeControlSeconds?: number
  onMove?: (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') => void
  onResign?: () => void
  acting?: boolean
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null)

  const myColor = myPlayerId ? colorForPlayer(session, myPlayerId) : null
  const flip = myColor === 'b'
  const finished = session.status === 'finished'
  const interactive = !!onMove && isMyTurn && !finished && !acting && !!myColor

  const chess = useMemo(() => {
    const c = new Chess()
    try {
      c.load(session.fen)
    } catch {
      // leave at starting position if the FEN is somehow invalid
    }
    return c
  }, [session.fen])

  const legalTargets = useMemo(() => {
    if (!selected || !interactive) return new Map<string, { promotion: boolean }>()
    const map = new Map<string, { promotion: boolean }>()
    try {
      for (const m of chess.moves({ square: selected as Square, verbose: true })) {
        const prev = map.get(m.to)
        map.set(m.to, { promotion: (prev?.promotion ?? false) || m.flags.includes('p') })
      }
    } catch {
      // invalid square — ignore
    }
    return map
  }, [chess, selected, interactive])

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell && cell.type === 'k' && cell.color === chess.turn()) return cell.square
      }
    }
    return null
  }, [chess])

  const material = useMemo(() => computeMaterial(chess), [chess])

  const orderedRanks = flip ? [...RANKS].reverse() : RANKS
  const orderedFiles = flip ? [...FILES].reverse() : FILES

  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId(session))
  const white = players.find((p) => p.id === session.player_white_id)
  const black = players.find((p) => p.id === session.player_black_id)
  const winnerName = players.find((p) => p.id === session.winner_player_id)?.name

  // Captured-pieces tray props for a given side. Each side shows the
  // opponent-colored pieces it has taken, plus its material lead (if any).
  const trayFor = (color: ChessColor) => ({
    name: (color === 'w' ? white : black)?.name ?? (color === 'w' ? 'White' : 'Black'),
    pieces: color === 'w' ? material.capturedByWhite : material.capturedByBlack,
    glyphColor: (color === 'w' ? 'b' : 'w') as ChessColor,
  })

  const bottomColor: ChessColor = flip ? 'b' : 'w'
  const topColor: ChessColor = flip ? 'w' : 'b'

  const clockFor = (color: ChessColor): number | null | undefined =>
    clocks?.timed ? (color === 'w' ? clocks.whiteMs : clocks.blackMs) : undefined
  const clockActive = (color: ChessColor): boolean => session.status === 'active' && session.current_turn === color

  const handleSquareClick = (square: string) => {
    if (!interactive) return
    const piece = chess.get(square as Square)

    if (selected) {
      const target = legalTargets.get(square)
      if (target) {
        if (target.promotion) {
          setPendingPromotion({ from: selected, to: square })
        } else {
          onMove?.(selected, square)
          setSelected(null)
        }
        return
      }
    }

    if (piece && piece.color === myColor) {
      setSelected(square)
      setPendingPromotion(null)
    } else {
      setSelected(null)
    }
  }

  const confirmPromotion = (piece: 'q' | 'r' | 'b' | 'n') => {
    if (!pendingPromotion) return
    onMove?.(pendingPromotion.from, pendingPromotion.to, piece)
    setPendingPromotion(null)
    setSelected(null)
  }

  return (
    <div className="space-y-4">
      {session.status === 'active' && (
        <ChessTurnBar
          turnPlayerName={turnPlayer?.name}
          isMyTurn={isMyTurn}
          secondsLeft={clocks?.activeSeconds ?? 0}
          hasTimer={clocks?.timed}
          inCheck={session.in_check}
        />
      )}

      <ChessCard className="p-3 flex items-center justify-between text-sm">
        <span className="font-bold">♔ {white?.name ?? 'White'}</span>
        <span className="text-faint">vs</span>
        <span className="font-bold">♚ {black?.name ?? 'Black'}</span>
      </ChessCard>

      {clocks?.timed && timeControlSeconds ? (
        <p className="text-center text-faint text-xs -mt-2">
          ⏱ {Math.round(timeControlSeconds / 60)} min each — your clock only counts down on your turn
        </p>
      ) : null}

      {finished && (
        <ChessCard className="p-4 text-center space-y-1">
          <p className="text-2xl">{session.is_draw ? '🤝' : '🏆'}</p>
          <p className="text-lg font-black">{winnerName ? `${winnerName} wins!` : "It's a draw!"}</p>
          {chessResultDetail(session.result_reason) && (
            <p className="text-xs text-faint capitalize">{chessResultDetail(session.result_reason)}</p>
          )}
        </ChessCard>
      )}

      <div className="max-w-md mx-auto w-full space-y-1.5">
        <CapturedTray {...trayFor(topColor)} clockMs={clockFor(topColor)} clockActive={clockActive(topColor)} />
        <div className="grid grid-cols-8 rounded-lg overflow-hidden border-2 border-[var(--border-strong)] shadow-lg">
          {orderedRanks.map((rank) =>
            orderedFiles.map((file) => {
              const square = `${file}${rank}`
              const piece = chess.get(square as Square)
              const isLight = (FILES.indexOf(file) + rank) % 2 === 1
              const target = legalTargets.get(square)
              const isSelected = selected === square
              const isLastMove = session.last_move_from === square || session.last_move_to === square
              const isCheck = checkSquare === square

              return (
                <button
                  key={square}
                  type="button"
                  onClick={() => handleSquareClick(square)}
                  disabled={!interactive}
                  className={[
                    'relative aspect-square flex items-center justify-center',
                    isLight ? 'bg-[#eed9b5]' : 'bg-[#b58863]',
                    interactive ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  {isLastMove && <span className="absolute inset-0 bg-yellow-300/40" />}
                  {isCheck && <span className="absolute inset-0 bg-rose-500/50" />}
                  {isSelected && <span className="absolute inset-0 ring-2 ring-inset ring-[var(--primary)]" />}
                  {piece && <Piece type={piece.type} color={piece.color} />}
                  {target && !piece && (
                    <span className="absolute w-1/4 h-1/4 rounded-full bg-black/30" />
                  )}
                  {target && piece && (
                    <span className="absolute inset-1 rounded-full ring-4 ring-black/30" />
                  )}
                </button>
              )
            })
          )}
        </div>
        <CapturedTray {...trayFor(bottomColor)} clockMs={clockFor(bottomColor)} clockActive={clockActive(bottomColor)} />
      </div>

      {pendingPromotion && (
        <ChessCard className="p-3 space-y-2">
          <p className="text-center text-sm font-bold">Promote to…</p>
          <div className="grid grid-cols-4 gap-2">
            {PROMOTION_PIECES.map(({ piece, label }) => (
              <button
                key={piece}
                type="button"
                onClick={() => confirmPromotion(piece)}
                className="rounded-lg border-2 border-[var(--border-strong)] py-2 text-sm font-bold hover:bg-[var(--primary)]/10"
              >
                {label}
              </button>
            ))}
          </div>
        </ChessCard>
      )}

      {myColor && session.status === 'active' && (
        <div className="space-y-2">
          <p className="text-center text-faint text-xs">
            You are <span className="font-bold">{myColor === 'w' ? '♔ White' : '♚ Black'}</span>
            {isMyTurn ? ' · tap a piece, then its destination' : ' · waiting for your opponent'}
          </p>
          {onResign && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onResign}
                disabled={!!acting}
                className="rounded-lg border-2 border-[var(--border-strong)] px-6 py-2 text-sm font-semibold text-muted hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
              >
                Resign
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
