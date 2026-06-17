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
  CORNER_BOUNDS,
  FINISHED_DISPLAY,
  HOME_GRID,
  TRACK_DIRECTION,
  TRACK_GRID,
  boardCellKind,
  moveDestinationCell,
  pieceStatusLabel,
  trackIndexAt,
} from '@/lib/ludo-board-layout'
import { LudoCard, LudoDice, LudoTurnBar } from '@/components/ludo/LudoChrome'

const BOARD_BG = '#e8d4b0'

const COLOR_CORNER: Record<LudoColor, string> = {
  red: '#fca5a5',
  green: '#86efac',
  yellow: '#fde047',
  blue: '#93c5fd',
}

const COLOR_CORNER_DARK: Record<LudoColor, string> = {
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
}

const COLOR_HOME: Record<LudoColor, string> = {
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
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

function BaseCorner({
  color,
  pieces,
  myPlayerId,
  selectablePieceIds,
  onMovePiece,
}: {
  color: LudoColor
  pieces: { color: LudoColor; pieceId: number; row: number; col: number; playerId: string }[]
  myPlayerId: string | null
  selectablePieceIds?: number[]
  onMovePiece?: (pieceId: number) => void
}) {
  const bounds = CORNER_BOUNDS[color]
  const left = (bounds.colStart / 15) * 100
  const top = (bounds.rowStart / 15) * 100
  const width = ((bounds.colEnd - bounds.colStart + 1) / 15) * 100
  const height = ((bounds.rowEnd - bounds.rowStart + 1) / 15) * 100

  const cornerPieces = pieces.filter((p) => p.color === color && BASE_SLOTS[color].some((s) => s.row === p.row && s.col === p.col))

  return (
    <div
      className="pointer-events-none absolute z-[5] flex items-center justify-center"
      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
    >
      <div
        className="flex h-[72%] w-[72%] items-center justify-center rounded-full border-[3px] border-white/90 shadow-inner"
        style={{ backgroundColor: 'rgba(255,255,255,0.92)' }}
      >
        <div className="grid h-[68%] w-[68%] grid-cols-2 gap-[18%]">
          {BASE_SLOTS[color].map((slot, index) => {
            const here = cornerPieces.find((p) => p.row === slot.row && p.col === slot.col)
            if (!here) {
              return <div key={index} className="aspect-square rounded-full bg-slate-200/60" />
            }
            const selectable = selectablePieceIds?.includes(here.pieceId) && here.playerId === myPlayerId
            return (
              <div key={index} className="pointer-events-auto flex items-center justify-center">
                <PieceToken
                  color={here.color}
                  selected={selectable}
                  label={here.playerId === myPlayerId ? here.pieceId : undefined}
                  onClick={selectable && onMovePiece ? () => onMovePiece(here.pieceId) : undefined}
                />
              </div>
            )
          })}
        </div>
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
      className="pointer-events-none absolute z-[4]"
      style={{ left: `${left}%`, top: `${top}%`, width: `${size}%`, height: `${size}%` }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
        <polygon points="50,50 0,0 100,0" fill={COLOR_CORNER_DARK.red} />
        <polygon points="50,50 0,0 0,100" fill={COLOR_CORNER_DARK.green} />
        <polygon points="50,50 100,0 100,100" fill={COLOR_CORNER_DARK.blue} />
        <polygon points="50,50 0,100 100,100" fill={COLOR_CORNER_DARK.yellow} />
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
    return { background: 'transparent', borderColor: '#1e293b' }
  }

  if (kind.kind === 'base' && kind.color) {
    return { background: COLOR_CORNER[kind.color], borderColor: '#1e293b' }
  }

  if (kind.kind === 'start' && kind.color) {
    return {
      background: COLOR_CORNER_DARK[kind.color],
      borderColor: '#1e293b',
    }
  }

  if (kind.kind === 'home' && kind.color) {
    return { background: COLOR_HOME[kind.color], borderColor: '#1e293b' }
  }

  return { background: '#ffffff', borderColor: '#1e293b' }
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

  const pathPieces = piecesOnBoard.filter((p) => !p.inBase)

  const cells: React.ReactNode[] = []
  for (let r = 0; r < 15; r += 1) {
    for (let c = 0; c < 15; c += 1) {
      const kind = boardCellKind(r, c)
      const isHighlight = highlightCells?.has(`${r},${c}`)
      const isStart = kind.kind === 'start'
      const isMyStart = isStart && kind.color === myColor
      const trackIdx = trackIndexAt(r, c)
      const direction = trackIdx != null ? TRACK_DIRECTION[trackIdx] : null
      const herePieces = pathPieces.filter((p) => p.row === r && p.col === c)

      cells.push(
        <div
          key={`${r}-${c}`}
          className={[
            'relative aspect-square flex items-center justify-center gap-0.5 flex-wrap p-0.5 border border-slate-800',
            isHighlight ? 'ring-2 ring-[var(--primary)] z-10' : '',
            isMyStart ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900 shadow-lg' : '',
            kind.kind === 'base' ? 'z-0' : 'z-[6]',
          ].join(' ')}
          style={cellStyle(kind, r, c)}
        >
          {isStart && (
            <span
              className={[
                'absolute font-black text-white drop-shadow pointer-events-none',
                herePieces.length > 0 ? 'text-[7px] opacity-80' : 'text-[10px]',
              ].join(' ')}
            >
              ▶
            </span>
          )}
          {kind.kind === 'track' && direction && herePieces.length === 0 && (
            <span className="absolute text-[7px] font-bold text-slate-300/90 pointer-events-none">
              {ARROW_GLYPH[direction]}
            </span>
          )}
          {herePieces.map((p) => {
            const selectable = selectablePieceIds?.includes(p.pieceId) && p.playerId === myPlayerId
            const showLabel = p.playerId === myPlayerId
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
        <p className="text-center text-xs text-muted leading-relaxed">
          You are{' '}
          <span className="font-bold" style={{ color: LUDO_COLOR_HEX[myColor] }}>
            {LUDO_COLOR_LABELS[myColor]}
          </span>
          . Roll a 6 to move a piece from your corner circle to your{' '}
          <span className="font-bold text-[var(--foreground)]">▶</span> square — then follow the arrows clockwise.
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
        {(['red', 'green', 'yellow', 'blue'] as LudoColor[])
          .filter((color) => activeColors.has(color))
          .map((color) => (
            <BaseCorner
              key={color}
              color={color}
              pieces={piecesOnBoard}
              myPlayerId={myPlayerId}
              selectablePieceIds={selectablePieceIds}
              onMovePiece={onMovePiece}
            />
          ))}
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

      {session.status_message && <p className="text-center text-sm text-muted">{session.status_message}</p>}

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
        <p className="text-center text-xs text-faint">
          Roll a 6 — piece leaves your corner and lands on your highlighted ▶ square
        </p>
      )}
    </LudoCard>
  )
}
