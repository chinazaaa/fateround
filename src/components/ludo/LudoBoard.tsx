'use client'

import { useMemo, type ReactNode } from 'react'
import type { LudoColor, LudoDiceRoll, LudoPlayerState, LudoSession, Player } from '@/types'
import {
  LUDO_COLOR_HEX,
  LUDO_COLOR_LABELS,
  START_POS,
  TRACK_LENGTH,
  finishedPieceCount,
  dedupeLudoMovesForUi,
  getLegalMovesFromRemaining,
  parseLudoDice,
  pickLudoMoveForPiece,
  resolveRemainingDice,
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
import { LudoTurnBar } from '@/components/ludo/LudoChrome'
import { LudoBoardCenter } from '@/components/ludo/LudoBoardCenter'
import { Avatar } from '@/components/Avatar'

/** White board "paper" — track + cross are white, corners are solid colour. */
const BOARD_BG = '#ffffff'
/** Dark indigo backdrop the board + player cards sit on (matches reference art). */
const PAGE_BG = '#454079'

/** Vivid solid colours used across the board — corners, home lanes,
 *  start/safe squares and the centre pinwheel — to match the classic app board. */
const COLOR_VIVID: Record<LudoColor, string> = {
  red: '#e5362b',
  green: '#37a93b',
  yellow: '#f9c00c',
  blue: '#2098e6',
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

/** The classic "yard" decoration for each colour's base: a solid colour corner
 *  framing a lighter inset panel, with the player's name above and a progress
 *  read-out below. The 4 home-slot rings and the pieces themselves are drawn in
 *  the absolutely-positioned overlay so they can animate between yard and track. */
function BaseCorner({ color, name, progress }: { color: LudoColor; name?: string; progress?: number }) {
  const bounds = CORNER_BOUNDS[color]
  const left = (bounds.colStart / 15) * 100
  const top = (bounds.rowStart / 15) * 100
  const width = ((bounds.colEnd - bounds.colStart + 1) / 15) * 100
  const height = ((bounds.rowEnd - bounds.rowStart + 1) / 15) * 100

  return (
    <div
      className="pointer-events-none absolute z-[5] flex items-center justify-center"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
        backgroundColor: COLOR_VIVID[color],
      }}
    >
      <div className="relative flex h-[80%] w-[80%] flex-col items-center justify-between rounded-[14%] bg-white/25 py-[6%]">
        <span className="max-w-[88%] truncate px-1 text-[9px] font-extrabold uppercase tracking-wide text-white drop-shadow sm:text-[11px]">
          {name ?? 'Open'}
        </span>
        <span className="text-[9px] font-bold text-white/90 drop-shadow sm:text-[11px]">{progress ?? 0}%</span>
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
        {/* Each triangle is the colour whose home lane enters from that edge */}
        <polygon points="50,50 0,0 100,0" fill={COLOR_VIVID.red} stroke="#1e293b" strokeWidth="0.5" />
        <polygon points="50,50 100,0 100,100" fill={COLOR_VIVID.blue} stroke="#1e293b" strokeWidth="0.5" />
        <polygon points="50,50 0,100 100,100" fill={COLOR_VIVID.yellow} stroke="#1e293b" strokeWidth="0.5" />
        <polygon points="50,50 0,0 0,100" fill={COLOR_VIVID.green} stroke="#1e293b" strokeWidth="0.5" />
      </svg>
    </div>
  )
}

function cellStyle(kind: ReturnType<typeof boardCellKind>, row: number, col: number): React.CSSProperties {
  if (kind.kind === 'void') {
    return { background: BOARD_BG, border: 'none' }
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
  players,
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
  onMovePiece?: (pieceId: number, diceIndex?: number) => void
  selectablePieceIds?: number[]
  highlightCells?: Set<string>
  center?: ReactNode
}) {
  const myColor = states.find((s) => s.player_id === myPlayerId)?.color
  const activeColors = useMemo(() => new Set(states.map((s) => s.color)), [states])

  const yardInfo = useMemo(() => {
    const map = new Map<LudoColor, { name: string; progress: number }>()
    for (const row of states) {
      const player = players.find((p) => p.id === row.player_id)
      const finished = row.pieces.filter((piece) => piece.zone === 'finished').length
      map.set(row.color, {
        name: player?.name ?? 'Player',
        progress: Math.round((finished / 4) * 100),
      })
    }
    return map
  }, [states, players])

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
            kind.kind === 'base' || kind.kind === 'center' ? 'border-0 z-0' : 'border border-slate-700/70 z-[6]',
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
        <p className="text-center text-xs text-white/70 leading-relaxed">
          You are{' '}
          <span className="font-bold" style={{ color: COLOR_VIVID[myColor] }}>
            {LUDO_COLOR_LABELS[myColor]}
          </span>
          . Roll a 6 on either die to leave your yard onto your <span className="font-bold text-white">★</span> start
          square, then follow the arrows clockwise around the board into your coloured home column.
        </p>
      )}
      <div
        className="relative rounded-lg overflow-hidden border-2 border-black/30 shadow-xl"
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
            <BaseCorner
              key={color}
              color={color}
              name={yardInfo.get(color)?.name}
              progress={yardInfo.get(color)?.progress}
            />
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

/** A single player chip — avatar, name and finished count — bordered in the
 *  player's colour, glowing on their turn. Matches the reference app's cards. */
function LudoPlayerCard({
  state,
  player,
  isTurn,
  isMe,
  align,
}: {
  state: LudoPlayerState
  player?: Player
  isTurn: boolean
  isMe: boolean
  align: 'left' | 'right'
}) {
  const color = COLOR_VIVID[state.color]
  const finished = finishedPieceCount(state.pieces)

  return (
    <div
      className={[
        'flex min-w-0 items-center gap-2 rounded-xl border-2 bg-black/15 px-2.5 py-1.5 backdrop-blur-sm transition-all',
        align === 'right' ? 'flex-row-reverse text-right' : '',
        isTurn ? 'scale-[1.03] shadow-lg' : 'opacity-90',
      ].join(' ')}
      style={{ borderColor: color, boxShadow: isTurn ? `0 0 0 2px ${color}, 0 0 12px ${color}80` : undefined }}
    >
      <span className="relative shrink-0">
        <Avatar name={player?.name ?? 'Player'} size="sm" />
        <span
          className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white"
          style={{ backgroundColor: color }}
        />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-bold leading-tight text-white">
          {player?.name ?? 'Player'}
          {isMe ? ' (you)' : ''}
        </p>
        <p
          className="flex items-center gap-1 text-[10px] font-semibold leading-tight text-white/70"
          style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
        >
          <span aria-hidden>☠</span>
          <span className="tabular-nums">{finished}/4 home</span>
        </p>
      </div>
    </div>
  )
}

/** A row of up to two player cards (one corner colour on each side). */
function LudoPlayerCardsRow({
  colors,
  states,
  players,
  session,
  myPlayerId,
}: {
  colors: [LudoColor, LudoColor]
  states: LudoPlayerState[]
  players: Player[]
  session: LudoSession
  myPlayerId: string | null
}) {
  const turnId = session.turn_order[session.current_turn_index]
  const [leftColor, rightColor] = colors
  const leftState = states.find((s) => s.color === leftColor)
  const rightState = states.find((s) => s.color === rightColor)

  if (!leftState && !rightState) return null

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="flex justify-start">
        {leftState && (
          <LudoPlayerCard
            state={leftState}
            player={players.find((p) => p.id === leftState.player_id)}
            isTurn={leftState.player_id === turnId}
            isMe={leftState.player_id === myPlayerId}
            align="left"
          />
        )}
      </div>
      <div className="flex justify-end">
        {rightState && (
          <LudoPlayerCard
            state={rightState}
            player={players.find((p) => p.id === rightState.player_id)}
            isTurn={rightState.player_id === turnId}
            isMe={rightState.player_id === myPlayerId}
            align="right"
          />
        )}
      </div>
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
  onMovePiece?: (pieceId: number, diceIndex?: number) => void
  acting?: boolean
  rolling?: boolean
  displayDice?: LudoDiceRoll | null
}) {
  const turnPlayer = players.find((p) => p.id === session.turn_order[session.current_turn_index])
  const myState = states.find((s) => s.player_id === myPlayerId)
  const parsedLastDice = parseLudoDice(session.last_dice)
  const remainingDice = resolveRemainingDice(session)

  const legalMoves = useMemo((): LudoMoveOption[] => {
    if (!isMyTurn || session.phase !== 'move' || !myState || remainingDice.length === 0 || !myPlayerId) {
      return []
    }
    return getLegalMovesFromRemaining(myState.color, myState.pieces, remainingDice, states, myPlayerId)
  }, [isMyTurn, session.phase, myState, states, myPlayerId, remainingDice])

  const displayMoves = useMemo(() => dedupeLudoMovesForUi(legalMoves), [legalMoves])

  const handleMovePiece = (pieceId: number, diceIndex?: number) => {
    if (!onMovePiece) return
    if (diceIndex != null) {
      onMovePiece(pieceId, diceIndex)
      return
    }
    const move = pickLudoMoveForPiece(legalMoves, pieceId)
    if (move) onMovePiece(move.pieceId, move.diceIndex)
  }

  const selectablePieceIds = [...new Set(displayMoves.map((m) => m.pieceId))]

  const highlightCells = useMemo(() => {
    if (!myState || legalMoves.length === 0) return undefined
    const cells = new Set<string>()

    for (const move of legalMoves) {
      const dest = moveDestinationCell(myState.color, move.to)
      if (dest) cells.add(`${dest.row},${dest.col}`)

      if (move.from.zone === 'track' && move.to.zone === 'track') {
        const steps = (move.from.pos - START_POS[myState.color] + TRACK_LENGTH) % TRACK_LENGTH
        for (const cell of trackCellsAlongSteps(myState.color, steps, move.diceValue)) {
          cells.add(`${cell.row},${cell.col}`)
        }
      }
    }
    return cells
  }, [legalMoves, myState])

  const diceDisplay = session.phase === 'move' ? parsedLastDice : rolling ? null : (displayDice ?? parsedLastDice)

  const hasBaseSixMove = displayMoves.some((m) => m.from.zone === 'base' && m.diceValue === 6)
  const allSixes = remainingDice.length > 0 && remainingDice.every((value) => value === 6)

  return (
    <div className="space-y-3 rounded-2xl p-3 text-white shadow-xl sm:p-4" style={{ backgroundColor: PAGE_BG }}>
      <LudoTurnBar
        turnPlayerName={turnPlayer?.name}
        isMyTurn={isMyTurn}
        secondsLeft={secondsLeft}
        hasTimer={hasTimer}
        urgent={urgent}
      />

      {/* Top corners: green (TL) · red (TR) */}
      <LudoPlayerCardsRow
        colors={['green', 'red']}
        states={states}
        players={players}
        session={session}
        myPlayerId={myPlayerId}
      />

      <LudoBoard
        session={session}
        states={states}
        players={players}
        myPlayerId={myPlayerId}
        onMovePiece={isMyTurn && session.phase === 'move' ? handleMovePiece : undefined}
        selectablePieceIds={selectablePieceIds}
        highlightCells={highlightCells}
      />

      {/* Bottom corners: yellow (BL) · blue (BR) */}
      <LudoPlayerCardsRow
        colors={['yellow', 'blue']}
        states={states}
        players={players}
        session={session}
        myPlayerId={myPlayerId}
      />

      {/* Dice + roll control sits below the board (not in the centre) */}
      <div className="flex items-center justify-center rounded-xl bg-black/20 px-3 py-2">
        <LudoBoardCenter
          dice={diceDisplay}
          rolling={rolling}
          showRoll={isMyTurn && session.phase === 'roll' && !!onRoll}
          onRoll={onRoll}
          acting={acting}
          consecutiveSixes={session.consecutive_sixes}
          phase={session.phase}
          lastDice={parsedLastDice}
          remainingDice={remainingDice}
        />
      </div>

      {session.status_message && <p className="text-center text-sm text-white/80">{session.status_message}</p>}

      {isMyTurn && session.phase === 'move' && displayMoves.length > 0 && onMovePiece && (
        <div className="space-y-2">
          <p className="text-center text-sm font-semibold text-white">
            {allSixes && remainingDice.length === 2
              ? 'Doubles! Use each 6 — bring out two pieces, or one out then move 6'
              : allSixes && remainingDice.length === 1
                ? 'Use your 6 — bring out another piece or move 6 spaces'
                : hasBaseSixMove
                  ? 'Use your 6 — pick a piece to bring onto your ★ square'
                  : remainingDice.length === 1
                    ? `Move a piece ${remainingDice[0]} spaces`
                    : `Use each die (${remainingDice.join(' & ')}) — pick a piece`}
          </p>
          <p className="text-center text-xs text-white/60">
            Tap a highlighted piece on the board or use a button below
          </p>
          <div className="grid grid-cols-2 gap-2">
            {displayMoves.map((move) => {
              const fromLabel = pieceStatusLabel(move.from)
              const toLabel =
                move.to.zone === 'finished'
                  ? 'Center — home!'
                  : move.to.zone === 'home'
                    ? `Home lane step ${move.to.pos + 1}`
                    : move.to.zone === 'track'
                      ? 'Onto the path'
                      : 'Leave base'
              return (
                <button
                  key={`${move.pieceId}-${move.diceIndex}`}
                  type="button"
                  disabled={acting}
                  onClick={() => handleMovePiece(move.pieceId, move.diceIndex)}
                  className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-left text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-50"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/70 text-[10px] font-bold text-white"
                      style={{ backgroundColor: myState ? COLOR_VIVID[myState.color] : undefined }}
                    >
                      {move.pieceId + 1}
                    </span>
                    Piece {move.pieceId + 1}
                    <span className="rounded bg-white/90 px-1 text-[10px] font-bold text-slate-900">
                      🎲 {move.diceValue}
                    </span>
                  </span>
                  <span className="mt-0.5 block font-normal text-white/60">
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
        <p className="text-center text-xs font-medium text-amber-300">
          No legal moves for this roll — wait for the turn to pass.
        </p>
      )}

      {isMyTurn && session.phase === 'roll' && !rolling && (
        <p className="text-center text-xs text-white/60">
          Tap 🎲 Roll below — roll a 6 on either die to leave your yard onto your ★ square
        </p>
      )}
    </div>
  )
}
