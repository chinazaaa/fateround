'use client'

import { useMemo } from 'react'
import type { LudoColor, LudoPlayerState, LudoSession, Player } from '@/types'
import {
  LUDO_COLOR_HEX,
  LUDO_COLOR_LABELS,
  finishedPieceCount,
  getLegalMoves,
  type LudoMoveOption,
} from '@/lib/ludo'
import {
  BASE_SLOTS,
  HOME_GRID,
  TRACK_GRID,
  boardCellKind,
  moveDestinationCell,
  pieceStatusLabel,
} from '@/lib/ludo-board-layout'
import { LudoCard, LudoDice, LudoTurnBar } from '@/components/ludo/LudoChrome'

const COLOR_BG: Record<LudoColor, string> = {
  red: '#fca5a5',
  green: '#86efac',
  yellow: '#fde047',
  blue: '#93c5fd',
}

const COLOR_BG_STRONG: Record<LudoColor, string> = {
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
}

const COLOR_BG_HOME: Record<LudoColor, string> = {
  red: '#fecaca',
  green: '#bbf7d0',
  yellow: '#fef08a',
  blue: '#bfdbfe',
}

function PieceToken({
  color,
  selected,
  onClick,
  small,
  label,
}: {
  color: LudoColor
  selected?: boolean
  onClick?: () => void
  small?: boolean
  label?: number
}) {
  const size = small ? 'h-3.5 w-3.5 text-[7px]' : 'h-5 w-5 sm:h-6 sm:w-6 text-[9px]'
  const El = onClick ? 'button' : 'span'
  return (
    <El
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={[
        'relative rounded-full border-2 border-white font-bold text-white shadow-md transition-transform flex items-center justify-center',
        size,
        selected ? 'ring-2 ring-[var(--primary)] ring-offset-1 scale-110 z-10' : '',
        onClick ? 'cursor-pointer hover:scale-105' : '',
      ].join(' ')}
      style={{ backgroundColor: LUDO_COLOR_HEX[color] }}
    >
      {label != null ? label + 1 : null}
    </El>
  )
}

function cellStyle(kind: ReturnType<typeof boardCellKind>, row: number, col: number): React.CSSProperties {
  if (kind.kind === 'void') {
    return { background: 'transparent', border: 'none' }
  }

  if (kind.kind === 'center') {
    if (row === 7 && col === 7) {
      return {
        background: `conic-gradient(from 225deg, ${COLOR_BG_STRONG.red} 0deg 90deg, ${COLOR_BG_STRONG.green} 90deg 180deg, ${COLOR_BG_STRONG.yellow} 180deg 270deg, ${COLOR_BG_STRONG.blue} 270deg 360deg)`,
      }
    }
    return { background: '#f8fafc' }
  }

  if (kind.kind === 'base' && kind.color) {
    return { background: COLOR_BG[kind.color] }
  }

  if (kind.kind === 'start' && kind.color) {
    return {
      background: COLOR_BG_STRONG[kind.color],
      boxShadow: `inset 0 0 0 2px rgba(255,255,255,0.85)`,
    }
  }

  if (kind.kind === 'home' && kind.color) {
    return { background: COLOR_BG_HOME[kind.color] }
  }

  return { background: '#ffffff' }
}

export function LudoBoard({
  states,
  myPlayerId,
  onMovePiece,
  selectablePieceIds,
  highlightCells,
}: {
  session: LudoSession
  states: LudoPlayerState[]
  players: Player[]
  myPlayerId: string | null
  onMovePiece?: (pieceId: number) => void
  selectablePieceIds?: number[]
  highlightCells?: Set<string>
}) {
  const myColor = states.find((s) => s.player_id === myPlayerId)?.color

  const piecesOnBoard = useMemo(() => {
    const list: {
      color: LudoColor
      pieceId: number
      row: number
      col: number
      playerId: string
    }[] = []

    for (const row of states) {
      for (const piece of row.pieces) {
        if (piece.zone === 'base') {
          const slot = BASE_SLOTS[row.color][piece.id]
          if (slot) list.push({ color: row.color, pieceId: piece.id, row: slot.row, col: slot.col, playerId: row.player_id })
        } else if (piece.zone === 'track') {
          const grid = TRACK_GRID[piece.pos]
          if (grid) list.push({ color: row.color, pieceId: piece.id, row: grid.row, col: grid.col, playerId: row.player_id })
        } else if (piece.zone === 'home') {
          const grid = HOME_GRID[row.color][piece.pos]
          if (grid) list.push({ color: row.color, pieceId: piece.id, row: grid.row, col: grid.col, playerId: row.player_id })
        } else if (piece.zone === 'finished') {
          list.push({ color: row.color, pieceId: piece.id, row: 7, col: 7, playerId: row.player_id })
        }
      }
    }
    return list
  }, [states])

  const cells: React.ReactNode[] = []
  for (let r = 0; r < 15; r += 1) {
    for (let c = 0; c < 15; c += 1) {
      const kind = boardCellKind(r, c)
      if (kind.kind === 'void') {
        cells.push(<div key={`${r}-${c}`} className="aspect-square" />)
        continue
      }

      const herePieces = piecesOnBoard.filter((p) => p.row === r && p.col === c)
      const isHighlight = highlightCells?.has(`${r},${c}`)
      const isStart = kind.kind === 'start'
      const isMyBase = kind.kind === 'base' && kind.color === myColor

      cells.push(
        <div
          key={`${r}-${c}`}
          className={[
            'relative aspect-square flex items-center justify-center gap-0.5 flex-wrap p-0.5 border border-slate-300/80',
            isHighlight ? 'ring-2 ring-[var(--primary)] z-10' : '',
            isMyBase ? 'ring-1 ring-[var(--primary)]/40' : '',
          ].join(' ')}
          style={cellStyle(kind, r, c)}
        >
          {isStart && herePieces.length === 0 && (
            <span className="absolute text-[8px] font-bold text-white/90 pointer-events-none">▶</span>
          )}
          {herePieces.map((p) => {
            const selectable = selectablePieceIds?.includes(p.pieceId) && p.playerId === myPlayerId
            const showLabel = p.playerId === myPlayerId && (selectable || kind.kind === 'base')
            return (
              <PieceToken
                key={`${p.playerId}-${p.pieceId}`}
                color={p.color}
                selected={selectable}
                small={herePieces.length > 1}
                label={showLabel ? p.pieceId : undefined}
                onClick={selectable && onMovePiece ? () => onMovePiece(p.pieceId) : undefined}
              />
            )
          })}
        </div>
      )
    }
  }

  return (
    <div className="w-full max-w-[min(100%,28rem)] mx-auto space-y-2">
      {myColor && (
        <p className="text-center text-xs text-muted">
          You are <span className="font-bold" style={{ color: LUDO_COLOR_HEX[myColor] }}>{LUDO_COLOR_LABELS[myColor]}</span>
          {' · '}▶ = start square · colored lane = path home
        </p>
      )}
      <div
        className="grid gap-0 rounded-2xl overflow-hidden border-4 border-slate-700/80 shadow-xl bg-[var(--background)] p-1"
        style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}
      >
        {cells}
      </div>
    </div>
  )
}

export function LudoPlayerStrip({
  states,
  players,
  session,
  myPlayerId,
}: {
  states: LudoPlayerState[]
  players: Player[]
  session: LudoSession
  myPlayerId: string | null
}) {
  const turnId = session.turn_order[session.current_turn_index]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {states.map((row) => {
        const player = players.find((p) => p.id === row.player_id)
        const isTurn = row.player_id === turnId
        const isMe = row.player_id === myPlayerId
        const finished = finishedPieceCount(row.pieces)
        const inBase = row.pieces.filter((p) => p.zone === 'base').length
        const onPath = row.pieces.filter((p) => p.zone === 'track').length
        return (
          <div
            key={row.player_id}
            className={[
              'rounded-lg border px-2 py-1.5 text-xs',
              isTurn ? 'border-[var(--primary)]/50 bg-[var(--primary)]/10' : 'border-[var(--border)] bg-[var(--surface-inset-bg)]/50',
            ].join(' ')}
          >
            <div className="flex items-center gap-1.5 font-semibold truncate">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: LUDO_COLOR_HEX[row.color] }} />
              <span className="truncate">{player?.name ?? 'Player'}{isMe ? ' (you)' : ''}</span>
            </div>
            <p className="text-faint mt-0.5">
              {finished}/4 finished · {inBase} in base · {onPath} on path
            </p>
          </div>
        )
      })}
    </div>
  )
}

export function LudoGamePanel({
  session,
  states,
  players,
  myPlayerId,
  isMyTurn,
  secondsLeft,
  hasTimer,
  urgent,
  onRoll,
  onMovePiece,
  acting,
  rolling,
  displayDice,
}: {
  session: LudoSession
  states: LudoPlayerState[]
  players: Player[]
  myPlayerId: string | null
  isMyTurn: boolean
  secondsLeft: number
  hasTimer: boolean
  urgent: boolean
  onRoll?: () => void
  onMovePiece?: (pieceId: number) => void
  acting?: boolean
  rolling?: boolean
  displayDice?: number | null
}) {
  const turnPlayer = players.find((p) => p.id === session.turn_order[session.current_turn_index])
  const myState = states.find((s) => s.player_id === myPlayerId)

  const legalMoves = useMemo((): LudoMoveOption[] => {
    if (!isMyTurn || session.phase !== 'move' || !myState || !session.last_dice || !myPlayerId) return []
    return getLegalMoves(myState.color, myState.pieces, session.last_dice, states, myPlayerId)
  }, [isMyTurn, session, myState, states, myPlayerId])

  const selectablePieceIds = legalMoves.map((m) => m.pieceId)

  const highlightCells = useMemo(() => {
    if (!myState || legalMoves.length === 0) return undefined
    const cells = new Set<string>()
    for (const move of legalMoves) {
      const cell = moveDestinationCell(myState.color, move.to)
      if (cell) cells.add(`${cell.row},${cell.col}`)
    }
    return cells
  }, [legalMoves, myState])

  const diceValue =
    session.phase === 'move' ? session.last_dice : rolling ? null : (displayDice ?? session.last_dice)

  return (
    <LudoCard className="p-3 sm:p-4 space-y-3">
      <LudoTurnBar
        turnPlayerName={turnPlayer?.name}
        isMyTurn={isMyTurn}
        secondsLeft={secondsLeft}
        hasTimer={hasTimer}
        urgent={urgent}
      />

      {session.status_message && (
        <p className="text-center text-sm text-muted">{session.status_message}</p>
      )}

      <div className="flex items-center justify-center gap-4">
        <LudoDice value={diceValue} rolling={rolling} />
        {session.last_dice && session.phase === 'move' && (
          <span className="text-sm font-bold text-[var(--foreground)]">Rolled {session.last_dice}</span>
        )}
        {session.consecutive_sixes > 0 && (
          <span className="text-xs text-amber-500 font-semibold">6s: {session.consecutive_sixes}/3</span>
        )}
      </div>

      <LudoBoard
        session={session}
        states={states}
        players={players}
        myPlayerId={myPlayerId}
        onMovePiece={isMyTurn && session.phase === 'move' ? onMovePiece : undefined}
        selectablePieceIds={selectablePieceIds}
        highlightCells={highlightCells}
      />

      <LudoPlayerStrip states={states} players={players} session={session} myPlayerId={myPlayerId} />

      {isMyTurn && session.phase === 'roll' && onRoll && (
        <button
          type="button"
          onClick={onRoll}
          disabled={acting || rolling}
          className="btn-primary w-full py-3 font-bold text-base"
        >
          {acting || rolling ? 'Rolling…' : 'Roll die'}
        </button>
      )}

      {isMyTurn && session.phase === 'move' && legalMoves.length > 0 && onMovePiece && (
        <div className="space-y-2">
          <p className="text-center text-xs font-semibold text-muted">Tap a piece below or on the board</p>
          <div className="grid grid-cols-2 gap-2">
            {legalMoves.map((move) => {
              const fromLabel = pieceStatusLabel(move.from)
              const toLabel =
                move.to.zone === 'finished'
                  ? 'Center — finished!'
                  : move.to.zone === 'home'
                    ? `Home lane step ${move.to.pos + 1}`
                    : move.to.zone === 'track'
                      ? 'Onto the path'
                      : 'Leave base'
              return (
                <button
                  key={move.pieceId}
                  type="button"
                  disabled={acting}
                  onClick={() => onMovePiece(move.pieceId)}
                  className="rounded-xl border border-[var(--primary)]/40 bg-[var(--primary)]/10 px-3 py-2 text-left text-xs font-semibold hover:bg-[var(--primary)]/20 disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/70 text-[10px] font-bold text-white"
                      style={{ backgroundColor: myState ? LUDO_COLOR_HEX[myState.color] : undefined }}
                    >
                      {move.pieceId + 1}
                    </span>
                    Piece {move.pieceId + 1}
                  </span>
                  <span className="mt-0.5 block text-faint font-normal">
                    {fromLabel} → {toLabel}
                    {move.captures ? ' · Capture!' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {isMyTurn && session.phase === 'roll' && !rolling && (
        <p className="text-center text-xs text-faint">Roll a 6 to move a piece from your colored corner onto ▶</p>
      )}
    </LudoCard>
  )
}
