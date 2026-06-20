'use client'

import { useMemo, type ReactNode } from 'react'
import type { LudoColor, LudoPlayerState, LudoSession, Player } from '@/types'
import {
  LUDO_COLOR_HEX,
  LUDO_COLOR_LABELS,
  START_POS,
  TRACK_LENGTH,
  finishedPieceCount,
  getLegalMoves,
  type LudoMoveOption,
} from '@/lib/ludo'
import {
  BASE_SLOTS,
  CORNER_BOUNDS,
  FINISHED_DISPLAY,
  HOME_GRID,
  TRACK_GRID,
  boardCellKind,
  moveDestinationCell,
  pathArrowAt,
  pieceStatusLabel,
  trackCellsAlongSteps,
} from '@/lib/ludo-board-layout'
import { LudoCard, LudoTurnBar } from '@/components/ludo/LudoChrome'
import { LudoBoardCenter } from '@/components/ludo/LudoBoardCenter'

const BOARD_BG = '#e8d4b0'

/** Vivid solid colours used across the board — corners, home lanes,
 *  start/safe squares and the centre pinwheel — to match a classic board. */
const COLOR_VIVID: Record<LudoColor, string> = {
  red: '#e11d2e',
  green: '#1faa3e',
  yellow: '#f5c518',
  blue: '#1f7fe0',
}

const ARROW_GLYPH: Record<string, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
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
        'relative z-20 rounded-full border-2 border-white font-bold text-white shadow-md transition-transform flex items-center justify-center',
        size,
        selected ? 'ring-2 ring-[var(--primary)] ring-offset-1 scale-110' : '',
        onClick ? 'cursor-pointer hover:scale-105' : '',
      ].join(' ')}
      style={{ backgroundColor: LUDO_COLOR_HEX[color] }}
    >
      {label != null ? label + 1 : null}
    </El>
  )
}

/** The classic "yard" decoration behind each colour's base: a white rounded
 *  square framing a colour-filled inner panel. The 4 home-slot circles and the
 *  pieces themselves are drawn in the absolutely-positioned overlay so they can
 *  animate between the yard and the track. */
function BaseCorner({ color }: { color: LudoColor }) {
  const bounds = CORNER_BOUNDS[color]
  const left = (bounds.colStart / 15) * 100
  const top = (bounds.rowStart / 15) * 100
  const width = ((bounds.colEnd - bounds.colStart + 1) / 15) * 100
  const height = ((bounds.rowEnd - bounds.rowStart + 1) / 15) * 100

  return (
    <div
      className="pointer-events-none absolute z-[5] flex items-center justify-center"
      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
    >
      <div className="flex h-[82%] w-[82%] items-center justify-center rounded-[18%] bg-white shadow-md">
        <div className="h-[78%] w-[78%] rounded-[14%]" style={{ backgroundColor: COLOR_VIVID[color] }} />
      </div>
    </div>
  )
}

function CenterTriangles() {
  const left = (6 / 15) * 100
  const top = (6 / 15) * 100
  const size = (3 / 15) * 100

  return (
    <div
      className="pointer-events-none absolute z-[4] flex items-center justify-center"
      style={{ left: `${left}%`, top: `${top}%`, width: `${size}%`, height: `${size}%` }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <polygon points="50,50 0,0 100,0" fill={COLOR_VIVID.green} stroke="#1e293b" strokeWidth="0.5" />
        <polygon points="50,50 100,0 100,100" fill={COLOR_VIVID.yellow} stroke="#1e293b" strokeWidth="0.5" />
        <polygon points="50,50 0,100 100,100" fill={COLOR_VIVID.red} stroke="#1e293b" strokeWidth="0.5" />
        <polygon points="50,50 0,0 0,100" fill={COLOR_VIVID.blue} stroke="#1e293b" strokeWidth="0.5" />
      </svg>
    </div>
  )
}

function cellStyle(
  kind: ReturnType<typeof boardCellKind>,
  row: number,
  col: number
): React.CSSProperties {
  if (kind.kind === 'void') {
    return { background: BOARD_BG, borderColor: '#1e293b' }
  }

  if (kind.kind === 'center') {
    return { background: 'transparent', border: 'none' }
  }

  if (kind.kind === 'base' && kind.color) {
    return { background: COLOR_VIVID[kind.color], border: 'none' }
  }

  if (kind.kind === 'start' && kind.color) {
    return {
      background: COLOR_VIVID[kind.color],
      borderColor: '#1e293b',
    }
  }

  if (kind.kind === 'safe' && kind.color) {
    return {
      background: COLOR_VIVID[kind.color],
      borderColor: '#1e293b',
      boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.7)',
    }
  }

  if (kind.kind === 'home' && kind.color) {
    return { background: COLOR_VIVID[kind.color], borderColor: '#1e293b' }
  }

  return { background: '#ffffff', borderColor: '#1e293b' }
}

export function LudoBoard({
  states,
  myPlayerId,
  onMovePiece,
  selectablePieceIds,
  highlightCells,
  center,
}: {
  session: LudoSession
  states: LudoPlayerState[]
  players: Player[]
  myPlayerId: string | null
  onMovePiece?: (pieceId: number) => void
  selectablePieceIds?: number[]
  highlightCells?: Set<string>
  center?: ReactNode
}) {
  const myColor = states.find((s) => s.player_id === myPlayerId)?.color
  const activeColors = useMemo(() => new Set(states.map((s) => s.color)), [states])

  const piecesOnBoard = useMemo(() => {
    const list: {
      color: LudoColor
      pieceId: number
      row: number
      col: number
      playerId: string
      inBase: boolean
    }[] = []

    for (const row of states) {
      for (const piece of row.pieces) {
        if (piece.zone === 'base') {
          const slot = BASE_SLOTS[row.color][piece.id]
          if (slot) {
            list.push({
              color: row.color,
              pieceId: piece.id,
              row: slot.row,
              col: slot.col,
              playerId: row.player_id,
              inBase: true,
            })
          }
        } else if (piece.zone === 'track') {
          const grid = TRACK_GRID[piece.pos]
          if (grid) {
            list.push({
              color: row.color,
              pieceId: piece.id,
              row: grid.row,
              col: grid.col,
              playerId: row.player_id,
              inBase: false,
            })
          }
        } else if (piece.zone === 'home') {
          const grid = HOME_GRID[row.color][piece.pos]
          if (grid) {
            list.push({
              color: row.color,
              pieceId: piece.id,
              row: grid.row,
              col: grid.col,
              playerId: row.player_id,
              inBase: false,
            })
          }
        } else if (piece.zone === 'finished') {
          const display = FINISHED_DISPLAY[row.color]
          list.push({
            color: row.color,
            pieceId: piece.id,
            row: display.row,
            col: display.col,
            playerId: row.player_id,
            inBase: false,
          })
        }
      }
    }
    return list
  }, [states])

  // Pieces are drawn as one absolutely-positioned overlay so a change in a
  // piece's (row,col) animates via CSS transition instead of teleporting.
  // Co-located pieces get a small horizontal offset so a stack stays legible.
  const overlayPieces = useMemo(() => {
    const totals = new Map<string, number>()
    for (const p of piecesOnBoard) {
      const key = `${p.row},${p.col}`
      totals.set(key, (totals.get(key) ?? 0) + 1)
    }
    const seen = new Map<string, number>()
    return piecesOnBoard.map((p) => {
      const key = `${p.row},${p.col}`
      const stackIndex = seen.get(key) ?? 0
      seen.set(key, stackIndex + 1)
      return { ...p, stackIndex, stackTotal: totals.get(key) ?? 1 }
    })
  }, [piecesOnBoard])

  const cells: React.ReactNode[] = []
  for (let r = 0; r < 15; r += 1) {
    for (let c = 0; c < 15; c += 1) {
      const kind = boardCellKind(r, c)
      const isHighlight = highlightCells?.has(`${r},${c}`)
      const isStart = kind.kind === 'start'
      const isSafe = kind.kind === 'safe'
      const isMyStart = isStart && kind.color === myColor
      const direction = pathArrowAt(r, c)

      cells.push(
        <div
          key={`${r}-${c}`}
          className={[
            'relative aspect-square flex items-center justify-center gap-0.5 flex-wrap p-0.5',
            kind.kind === 'base' || kind.kind === 'center'
              ? 'border-0 z-0'
              : 'border border-slate-700/70 z-[6]',
            isHighlight ? 'ring-2 ring-[var(--primary)] z-10' : '',
            isMyStart ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 shadow-lg' : '',
          ].join(' ')}
          style={cellStyle(kind, r, c)}
        >
          {isStart && (
            <span className="absolute text-[11px] font-black text-white drop-shadow pointer-events-none">★</span>
          )}
          {isSafe && (
            <span className="absolute text-[8px] font-black text-white/90 drop-shadow pointer-events-none">★</span>
          )}
          {kind.kind === 'track' && direction && (
            <span className="absolute text-[7px] font-bold text-slate-300/90 pointer-events-none">
              {ARROW_GLYPH[direction]}
            </span>
          )}
        </div>
      )
    }
  }

  return (
    <div className="w-full max-w-[min(100%,28rem)] mx-auto space-y-2">
      {myColor && (
        <p className="text-center text-xs text-muted leading-relaxed">
          You are{' '}
          <span className="font-bold" style={{ color: LUDO_COLOR_HEX[myColor] }}>
            {LUDO_COLOR_LABELS[myColor]}
          </span>
          . Roll a 6 to leave your yard onto your{' '}
          <span className="font-bold text-[var(--foreground)]">★</span> start square, then follow the
          arrows clockwise around the board into your coloured home column.
        </p>
      )}
      <div
        className="relative rounded-lg overflow-hidden border-[5px] border-slate-900 shadow-xl"
        style={{ background: BOARD_BG }}
      >
        <div className="grid gap-0" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}>
          {cells}
        </div>
        <CenterTriangles />
        {center && (
          <div
            className="absolute z-[15] flex items-center justify-center pointer-events-auto"
            style={{
              left: `${(6 / 15) * 100}%`,
              top: `${(6 / 15) * 100}%`,
              width: `${(3 / 15) * 100}%`,
              height: `${(3 / 15) * 100}%`,
            }}
          >
            {center}
          </div>
        )}
        {(['red', 'green', 'yellow', 'blue'] as LudoColor[])
          .filter((color) => activeColors.has(color))
          .map((color) => (
            <BaseCorner key={color} color={color} />
          ))}

        {/* Animated piece overlay — tokens slide between cells via CSS transition */}
        <div className="pointer-events-none absolute inset-0 z-20">
          {(['red', 'green', 'yellow', 'blue'] as LudoColor[])
            .filter((color) => activeColors.has(color))
            .flatMap((color) =>
              BASE_SLOTS[color].map((slot, i) => (
                <span
                  key={`yard-${color}-${i}`}
                  className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-inner sm:h-6 sm:w-6"
                  style={{
                    left: `${((slot.col + 0.5) / 15) * 100}%`,
                    top: `${((slot.row + 0.5) / 15) * 100}%`,
                    boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.12)',
                  }}
                />
              ))
            )}
          {overlayPieces.map((p) => {
            const selectable = !!(selectablePieceIds?.includes(p.pieceId) && p.playerId === myPlayerId)
            const offset = (p.stackIndex - (p.stackTotal - 1) / 2) * 7
            return (
              <div
                key={`${p.playerId}-${p.pieceId}`}
                className="absolute transition-all duration-300 ease-in-out"
                style={{
                  left: `${((p.col + 0.5) / 15) * 100}%`,
                  top: `${((p.row + 0.5) / 15) * 100}%`,
                  transform: `translate(calc(-50% + ${offset}px), -50%)`,
                }}
              >
                <div className={selectable ? 'pointer-events-auto' : ''}>
                  <PieceToken
                    color={p.color}
                    selected={selectable}
                    small={p.stackTotal > 2}
                    label={p.playerId === myPlayerId ? p.pieceId : undefined}
                    onClick={selectable && onMovePiece ? () => onMovePiece(p.pieceId) : undefined}
                  />
                </div>
              </div>
            )
          })}
        </div>
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
        const onPath = row.pieces.filter((p) => p.zone === 'track' || p.zone === 'home').length
        return (
          <div
            key={row.player_id}
            className={[
              'rounded-lg border px-2 py-1.5 text-xs',
              isTurn
                ? 'border-[var(--primary)]/50 bg-[var(--primary)]/10'
                : 'border-[var(--border)] bg-[var(--surface-inset-bg)]/50',
            ].join(' ')}
          >
            <div className="flex items-center gap-1.5 font-semibold truncate">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: LUDO_COLOR_HEX[row.color] }}
              />
              <span className="truncate">
                {player?.name ?? 'Player'}
                {isMe ? ' (you)' : ''}
              </span>
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
    if (!myState || legalMoves.length === 0 || !session.last_dice) return undefined
    const cells = new Set<string>()
    const dice = session.last_dice

    for (const move of legalMoves) {
      const dest = moveDestinationCell(myState.color, move.to)
      if (dest) cells.add(`${dest.row},${dest.col}`)

      if (move.from.zone === 'track' && move.to.zone === 'track') {
        const steps =
          (move.from.pos - START_POS[myState.color] + TRACK_LENGTH) % TRACK_LENGTH
        for (const cell of trackCellsAlongSteps(myState.color, steps, dice)) {
          cells.add(`${cell.row},${cell.col}`)
        }
      }
    }
    return cells
  }, [legalMoves, myState, session.last_dice])

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

      {session.status_message && <p className="text-center text-sm text-muted">{session.status_message}</p>}

      <LudoBoard
        session={session}
        states={states}
        players={players}
        myPlayerId={myPlayerId}
        onMovePiece={isMyTurn && session.phase === 'move' ? onMovePiece : undefined}
        selectablePieceIds={selectablePieceIds}
        highlightCells={highlightCells}
        center={
          <LudoBoardCenter
            diceValue={diceValue}
            rolling={rolling}
            showRoll={isMyTurn && session.phase === 'roll' && !!onRoll}
            onRoll={onRoll}
            acting={acting}
            consecutiveSixes={session.consecutive_sixes}
            phase={session.phase}
            lastDice={session.last_dice}
          />
        }
      />

      <LudoPlayerStrip states={states} players={players} session={session} myPlayerId={myPlayerId} />

      {isMyTurn && session.phase === 'move' && legalMoves.length > 0 && onMovePiece && (
        <div className="space-y-2">
          <p className="text-center text-sm font-semibold text-[var(--foreground)]">
            {session.last_dice === 6 && legalMoves.some((m) => m.from.zone === 'base')
              ? 'You rolled a 6 — pick a piece to bring onto your ★ square'
              : 'Choose which piece to move'}
          </p>
          <p className="text-center text-xs text-muted">Tap a highlighted piece on the board or use a button below</p>
          <div className="grid grid-cols-2 gap-2">
            {legalMoves.map((move) => {
              const fromLabel = pieceStatusLabel(move.from)
              const toLabel =
                move.to.zone === 'finished'
                  ? 'Center — KING!'
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

      {isMyTurn && session.phase === 'move' && legalMoves.length === 0 && (
        <p className="text-center text-xs text-amber-600 font-medium">
          No legal moves for this roll — wait for the turn to pass.
        </p>
      )}

      {isMyTurn && session.phase === 'roll' && !rolling && (
        <p className="text-center text-xs text-faint">
          Tap 🎲 Roll in the board centre — roll a 6 to leave your yard onto your ★ square
        </p>
      )}
    </LudoCard>
  )
}
