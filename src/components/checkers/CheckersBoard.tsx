'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  checkersResultDetail,
  colorForPlayer,
  colorOfPiece,
  currentTurnPlayerId,
  legalStepsFromSquare,
  squareId,
} from '@/lib/checkers'
import type { CheckersColor, Player, CheckersSession } from '@/types'
import { CheckersCard, CheckersTurnBar } from '@/components/checkers/CheckersChrome'
import { useCheckersTurnSound } from '@/hooks/useCheckersTurnSound'

// Board look — a single clean wood-ish theme (no per-host appearance picker).
const LIGHT_SQUARE = '#e8d3ab'
const DARK_SQUARE = '#9c6b3f'

const RC = [0, 1, 2, 3, 4, 5, 6, 7] as const

/** Format remaining clock ms as m:ss (always reads as a clock, e.g. 10:00, 0:05). */
function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * A single player's live clock, isolated in its own component. Only the active
 * player's chip re-renders on a tick — the board itself doesn't, so moving
 * pieces stays smooth and the countdown doesn't stutter under render load.
 */
function CheckersClockChip({ session, color }: { session: CheckersSession; color: CheckersColor }) {
  const [, bump] = useState(0)
  const timed = session.red_time_ms != null && session.black_time_ms != null
  const active = session.status === 'active' && session.current_turn === color

  useEffect(() => {
    if (!timed || !active) return
    const id = window.setInterval(() => bump((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [timed, active])

  if (!timed) return null

  const base = (color === 'r' ? session.red_time_ms : session.black_time_ms) ?? 0
  const startedAt = session.turn_started_at ? Date.parse(session.turn_started_at) : null
  const ms = active && startedAt != null ? Math.max(0, base - Math.max(0, Date.now() - startedAt)) : base
  const lowTime = ms <= 30000

  return (
    <span
      className={[
        'ml-auto shrink-0 tabular-nums font-black rounded-md px-2 py-0.5 text-sm border',
        active
          ? lowTime
            ? 'bg-rose-500/20 border-rose-400 text-rose-300 animate-pulse'
            : 'bg-[var(--primary)]/15 border-[var(--primary)]/50 text-[var(--foreground)]'
          : 'bg-[var(--surface-inset-bg)] border-[var(--border)] text-muted',
      ].join(' ')}
    >
      {formatClock(ms)}
    </span>
  )
}

/** A single checkers piece — a colored disc, kings carry a crown. */
function Disc({ piece }: { piece: string }) {
  const color = colorOfPiece(piece)
  if (!color) return null
  const king = piece === 'R' || piece === 'B'
  const fill = color === 'r' ? '#dc2626' : '#1f2937'
  const ring = color === 'r' ? '#7f1d1d' : '#000000'
  return (
    <span
      className="relative z-10 flex items-center justify-center rounded-full w-[78%] h-[78%] select-none"
      style={{ background: fill, boxShadow: `inset 0 0 0 3px ${ring}, 0 2px 4px rgba(0,0,0,0.35)` }}
    >
      {king && <span className="text-amber-300 text-[0.9em] leading-none drop-shadow">♔</span>}
    </span>
  )
}

/** A player's row: name, count of pieces captured, and clock. */
function CaptureTray({
  name,
  glyphColor,
  captured,
  clock,
}: {
  name: string
  glyphColor: CheckersColor
  captured: number
  clock?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 min-h-[1.75rem] px-1">
      <span className="text-xs font-bold shrink-0">
        {glyphColor === 'r' ? '🔴' : '⚫'} {name}
      </span>
      {captured > 0 && <span className="text-xs text-faint">· {captured} captured</span>}
      {clock}
    </div>
  )
}

export function CheckersGamePanel({
  session,
  players,
  myPlayerId,
  isMyTurn,
  timeControlSeconds,
  onMove,
  onResign,
  acting,
}: {
  session: CheckersSession
  players: Player[]
  myPlayerId: string | null
  isMyTurn: boolean
  timeControlSeconds?: number
  onMove?: (from: string, to: string) => void
  onResign?: () => void
  acting?: boolean
}) {
  const [selected, setSelected] = useState<string | null>(null)

  // Cue when it becomes the local player's turn. Only fires for the seated player
  // (a spectating host has a null myPlayerId, so it stays silent for them).
  useCheckersTurnSound(session, myPlayerId, true)

  const myColor = myPlayerId ? colorForPlayer(session, myPlayerId) : null
  // Red sits on the bottom rows by default, so the Black player flips the board
  // so their own pieces are nearest.
  const flip = myColor === 'b'
  const finished = session.status === 'finished'
  const interactive = !!onMove && isMyTurn && !finished && !acting && !!myColor

  // When a multi-jump is in progress, the chaining piece is the only legal mover.
  useEffect(() => {
    if (session.must_continue_from) setSelected(session.must_continue_from)
  }, [session.must_continue_from])

  const legalTargets = useMemo(() => {
    if (!selected || !interactive || !myColor) return new Set<string>()
    return new Set(legalStepsFromSquare(session.board, myColor, selected, session.must_continue_from).map((s) => s.to))
  }, [session.board, session.must_continue_from, selected, interactive, myColor])

  const counts = useMemo(() => {
    let red = 0
    let black = 0
    for (const ch of session.board) {
      const c = colorOfPiece(ch)
      if (c === 'r') red += 1
      else if (c === 'b') black += 1
    }
    return { red, black }
  }, [session.board])

  const orderedRows = flip ? [...RC].reverse() : RC
  const orderedCols = flip ? [...RC].reverse() : RC

  const turnPlayer = players.find((p) => p.id === currentTurnPlayerId(session))
  const red = players.find((p) => p.id === session.player_red_id)
  const black = players.find((p) => p.id === session.player_black_id)
  const winnerName = players.find((p) => p.id === session.winner_player_id)?.name
  const timed = session.red_time_ms != null && session.black_time_ms != null

  const bottomColor: CheckersColor = flip ? 'b' : 'r'
  const topColor: CheckersColor = flip ? 'r' : 'b'

  const trayFor = (color: CheckersColor) => ({
    name: (color === 'r' ? red : black)?.name ?? (color === 'r' ? 'Red' : 'Black'),
    glyphColor: color,
    // How many of the opponent's 12 men this side has captured.
    captured: 12 - (color === 'r' ? counts.black : counts.red),
  })

  const handleSquareClick = (square: string) => {
    if (!interactive || !myColor) return
    if (selected && legalTargets.has(square)) {
      onMove?.(selected, square)
      // Keep selection if a chain may continue; the session update re-selects it.
      setSelected(null)
      return
    }
    if (
      colorOfPiece(session.board[Number(square[0]) * 8 + Number(square[1])]) === myColor &&
      !session.must_continue_from
    ) {
      setSelected(square)
    }
  }

  return (
    <div className="space-y-4">
      {session.status === 'active' && (
        <CheckersTurnBar
          turnPlayerName={turnPlayer?.name}
          isMyTurn={isMyTurn}
          mustContinue={isMyTurn && !!session.must_continue_from}
        />
      )}

      <CheckersCard className="p-3 flex items-center justify-between text-sm">
        <span className="font-bold">🔴 {red?.name ?? 'Red'}</span>
        <span className="text-faint">vs</span>
        <span className="font-bold">⚫ {black?.name ?? 'Black'}</span>
      </CheckersCard>

      {timed && timeControlSeconds ? (
        <p className="text-center text-faint text-xs -mt-2">
          ⏱ {Math.round(timeControlSeconds / 60)} min each — your clock only counts down on your turn
        </p>
      ) : null}

      {finished && (
        <CheckersCard className="p-4 text-center space-y-1">
          <p className="text-2xl">{session.is_draw ? '🤝' : '🏆'}</p>
          <p className="text-lg font-black">{winnerName ? `${winnerName} wins!` : "It's a draw!"}</p>
          {checkersResultDetail(session.result_reason) && (
            <p className="text-xs text-faint capitalize">{checkersResultDetail(session.result_reason)}</p>
          )}
        </CheckersCard>
      )}

      <div className="max-w-lg sm:max-w-xl lg:max-w-2xl mx-auto w-full space-y-1.5">
        <CaptureTray {...trayFor(topColor)} clock={<CheckersClockChip session={session} color={topColor} />} />
        <div className="grid grid-cols-8 rounded-lg overflow-hidden border-2 border-[var(--border-strong)] shadow-lg">
          {orderedRows.map((row) =>
            orderedCols.map((col) => {
              const square = squareId(row, col)
              const dark = (row + col) % 2 === 1
              const piece = dark ? session.board[row * 8 + col] : '.'
              const hasPiece = piece !== '.'
              const isTarget = legalTargets.has(square)
              const isSelected = selected === square
              const isLastMove = session.last_move_from === square || session.last_move_to === square

              return (
                <button
                  key={square}
                  type="button"
                  onClick={() => handleSquareClick(square)}
                  disabled={!interactive || !dark}
                  aria-label={
                    hasPiece
                      ? `${square}, ${colorOfPiece(piece) === 'r' ? 'red' : 'black'} ${piece === piece.toUpperCase() ? 'king' : 'man'}`
                      : `${square}, ${dark ? 'empty' : 'unused'}`
                  }
                  style={{ backgroundColor: dark ? DARK_SQUARE : LIGHT_SQUARE }}
                  className={[
                    'relative aspect-square flex items-center justify-center',
                    interactive && dark ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  {isLastMove && <span className="absolute inset-0 z-0 bg-yellow-300/40" />}
                  {isSelected && <span className="absolute inset-0 z-20 ring-2 ring-inset ring-[var(--primary)]" />}
                  {hasPiece && <Disc piece={piece} />}
                  {isTarget && !hasPiece && <span className="absolute z-20 w-1/3 h-1/3 rounded-full bg-black/30" />}
                  {isTarget && hasPiece && <span className="absolute inset-1 z-20 rounded-full ring-4 ring-black/30" />}
                </button>
              )
            })
          )}
        </div>
        <CaptureTray {...trayFor(bottomColor)} clock={<CheckersClockChip session={session} color={bottomColor} />} />
      </div>

      {myColor && session.status === 'active' && (
        <div className="space-y-2">
          <p className="text-center text-faint text-xs">
            You are <span className="font-bold">{myColor === 'r' ? '🔴 Red' : '⚫ Black'}</span>
            {isMyTurn
              ? session.must_continue_from
                ? ' · you must keep jumping with the same piece'
                : ' · tap a piece, then its destination'
              : ' · waiting for your opponent'}
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
