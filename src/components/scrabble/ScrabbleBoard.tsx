'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Player, ScrabbleSession, ScrabblePlayerState, ScrabblePlacedTile } from '@/types'
import { SCRABBLE_BOARD_SIZE, SCRABBLE_CENTER, scrabblePremiumAt, type ScrabblePremium } from '@/lib/scrabble-constants'
import { currentTurnPlayerId, scorePlacement } from '@/lib/scrabble-board'
import { ScrabbleCard, ScrabbleTurnBar } from '@/components/scrabble/ScrabbleChrome'
import { useScrabbleTurnTimer } from '@/hooks/useScrabbleTurnTimer'
import { useScrabbleTurnSound } from '@/hooks/useScrabbleTurnSound'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Drag id namespaces — kept distinct so a single onDragEnd can discriminate intent.
const TILE_PREFIX = 'tile-' // a rack tile (by its TRUE rack index)
const CELL_PREFIX = 'cell-' // an empty board square
const PENDING_PREFIX = 'pending-' // a tile already placed (pending) on the board

/** A tile placed this turn, remembering which rack slot it came from. */
type PendingTile = ScrabblePlacedTile & { rackIndex: number }

/** Background + label for a premium square. */
function premiumStyle(prem: ScrabblePremium): { bg: string; label: string } {
  switch (prem) {
    case 'TW':
      return { bg: 'bg-rose-600', label: 'TW' }
    case 'DW':
      return { bg: 'bg-pink-500', label: 'DW' }
    case 'TL':
      return { bg: 'bg-blue-600', label: 'TL' }
    case 'DL':
      return { bg: 'bg-sky-500', label: 'DL' }
    default:
      return { bg: 'bg-[var(--surface-inset-bg)]', label: '' }
  }
}

/** A rendered letter tile (wooden style). */
function LetterTile({
  letter,
  isBlank,
  tileValues,
  pending,
  size = 'board',
}: {
  letter: string
  isBlank: boolean
  tileValues: Record<string, number>
  pending?: boolean
  size?: 'board' | 'rack'
}) {
  const value = isBlank ? 0 : (tileValues[letter.toUpperCase()] ?? 0)
  return (
    <span
      className={[
        // Raised "wooden" tile: light-to-dark gradient + inset top highlight + thicker
        // bottom edge + drop shadow give a 3D bevel.
        'relative flex items-center justify-center font-black leading-none w-full h-full text-amber-950',
        'border border-amber-500/60 border-b-[3px] border-b-amber-600/70',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(0,0,0,0.35)]',
        pending
          ? 'bg-gradient-to-b from-amber-200 to-amber-400 ring-2 ring-inset ring-emerald-600'
          : 'bg-gradient-to-b from-amber-100 to-amber-300',
        size === 'rack' ? 'text-xl sm:text-2xl rounded-md shadow-md' : 'text-[2.4vw] sm:text-base rounded-[3px]',
      ].join(' ')}
    >
      {letter.toUpperCase()}
      {!isBlank && (
        <span
          className={[
            'absolute font-bold text-amber-700/90',
            size === 'rack' ? 'bottom-0.5 right-1 text-[0.6rem]' : 'bottom-0 right-0.5 text-[1.1vw] sm:text-[0.5rem]',
          ].join(' ')}
        >
          {value}
        </span>
      )}
    </span>
  )
}

/** A single board square. Empty squares are drop targets; pending tiles are draggable (drag off to recall). */
function BoardCell({
  row,
  col,
  committed,
  pendingTile,
  isLastMoveCell,
  interactive,
  exchangeMode,
  tileValues,
  onTap,
}: {
  row: number
  col: number
  committed: { letter: string; isBlank: boolean } | null
  pendingTile: PendingTile | undefined
  isLastMoveCell: boolean
  interactive: boolean
  exchangeMode: boolean
  tileValues: Record<string, number>
  onTap: (row: number, col: number) => void
}) {
  const isCenter = row === SCRABBLE_CENTER.row && col === SCRABBLE_CENTER.col
  const prem = scrabblePremiumAt(row, col)
  const { bg, label } = premiumStyle(prem)
  const isEmpty = !committed && !pendingTile

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${CELL_PREFIX}${row}-${col}`,
    disabled: !interactive || exchangeMode || !isEmpty,
  })
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: `${PENDING_PREFIX}${row}-${col}`,
    disabled: !interactive || exchangeMode || !pendingTile,
  })

  const tile = committed ?? (pendingTile ? { letter: pendingTile.letter, isBlank: pendingTile.isBlank } : null)
  const dragProps = pendingTile && interactive && !exchangeMode ? { ...attributes, ...listeners } : {}

  return (
    <button
      ref={(node) => {
        setDropRef(node)
        setDragRef(node)
      }}
      type="button"
      onClick={() => onTap(row, col)}
      disabled={!interactive || exchangeMode}
      style={{
        touchAction: pendingTile ? 'none' : undefined,
        opacity: isDragging ? 0.4 : undefined,
      }}
      {...dragProps}
      className={[
        'relative aspect-square flex items-center justify-center p-0 border border-black/15',
        tile ? 'bg-transparent' : bg,
        isOver ? 'ring-2 ring-inset ring-emerald-400' : '',
        interactive && !exchangeMode ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      {tile ? (
        <LetterTile
          letter={tile.letter}
          isBlank={tile.isBlank}
          tileValues={tileValues}
          pending={!!pendingTile}
          size="board"
        />
      ) : isCenter ? (
        <span className="text-[2.4vw] sm:text-sm leading-none text-amber-50/90">★</span>
      ) : label ? (
        <span className="text-[1.3vw] sm:text-[0.55rem] font-black leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
          {label}
        </span>
      ) : null}
      {/* Clear highlight of the most recently played tiles — a bright ring + glow on top. */}
      {isLastMoveCell && (
        <span className="pointer-events-none absolute inset-0 z-10 rounded-[3px] ring-2 ring-inset ring-yellow-400 shadow-[0_0_7px_2px_rgba(250,204,21,0.7)]" />
      )}
    </button>
  )
}

/** A draggable + sortable rack tile. Tap selects it; drag places it on the board or reorders the rack. */
function RackTile({
  id,
  letter,
  used,
  selected,
  exchangeSelected,
  interactive,
  disabled,
  tileValues,
  onClick,
}: {
  id: string
  letter: string
  used: boolean
  selected: boolean
  exchangeSelected: boolean
  interactive: boolean
  disabled: boolean
  tileValues: Record<string, number>
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none' as const,
    opacity: isDragging ? 0.4 : used ? 0.25 : undefined,
  }
  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={onClick}
      disabled={!interactive || used}
      {...attributes}
      {...listeners}
      className={[
        'aspect-square w-9 sm:w-11 rounded-md transition-all touch-none',
        selected ? '-translate-y-1.5 ring-2 ring-emerald-500' : '',
        exchangeSelected ? '-translate-y-1.5 ring-2 ring-rose-500' : '',
        interactive && !used ? 'cursor-pointer' : 'cursor-default',
      ].join(' ')}
    >
      {used ? (
        <span className="block w-full h-full rounded-md border-2 border-dashed border-[var(--border)]" />
      ) : (
        <LetterTile
          letter={letter === '?' ? ' ' : letter}
          isBlank={letter === '?'}
          tileValues={tileValues}
          size="rack"
        />
      )}
    </button>
  )
}

/** Scores — a full vertical card (desktop sidebar) or a compact horizontal strip (mobile sticky bar). */
function BoardScores({
  session,
  players,
  stateByPlayer,
  turnPlayerId,
  myPlayerId,
  finished,
  topScore,
  compact,
}: {
  session: ScrabbleSession
  players: Player[]
  stateByPlayer: Map<string, ScrabblePlayerState>
  turnPlayerId: string | null
  myPlayerId: string | null
  finished: boolean
  topScore: number
  compact?: boolean
}) {
  const rows = session.turn_order.map((pid) => {
    const player = players.find((p) => p.id === pid)
    const score = stateByPlayer.get(pid)?.score ?? 0
    return {
      pid,
      name: player?.name ?? 'Player',
      score,
      onTurn: pid === turnPlayerId && !finished,
      isMe: pid === myPlayerId,
      isLeader: score > 0 && score === topScore,
    }
  })

  if (compact) {
    return (
      <div className="flex gap-2 overflow-x-auto rounded-xl border border-[var(--border-strong)] bg-[var(--card-strong)] p-1.5 shadow-md">
        {rows.map((r) => (
          <div
            key={r.pid}
            className={[
              'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm',
              r.onTurn ? 'bg-[var(--primary)]/15 ring-1 ring-[var(--primary)]/40' : 'bg-[var(--surface-inset-bg)]',
            ].join(' ')}
          >
            {r.onTurn && <span className="text-[var(--primary)]">▶</span>}
            {r.isLeader && <span>👑</span>}
            <span className="font-bold text-[var(--foreground)] max-w-[7rem] truncate">{r.name}</span>
            <span className="font-black tabular-nums text-[var(--foreground)]">{r.score}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <ScrabbleCard className="p-3 space-y-2">
      <p className="label-caps text-xs">Scores</p>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.pid}
            className={[
              'flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors',
              r.onTurn
                ? 'border-[var(--primary)]/50 bg-[var(--primary)]/15'
                : 'border-[var(--border)] bg-[var(--surface-inset-bg)]',
            ].join(' ')}
          >
            <span className="flex min-w-0 items-center gap-1.5 font-bold text-[var(--foreground)]">
              {r.onTurn && <span className="shrink-0 text-[var(--primary)]">▶</span>}
              {r.isLeader && (
                <span className="shrink-0" title="Leading">
                  👑
                </span>
              )}
              <span className="truncate">{r.name}</span>
              {r.isMe && <span className="shrink-0 text-faint text-xs font-normal">you</span>}
            </span>
            <span className="shrink-0 rounded-lg bg-[var(--background)] px-2.5 py-1 text-lg font-black tabular-nums text-[var(--foreground)] shadow-sm">
              {r.score}
            </span>
          </div>
        ))}
      </div>
    </ScrabbleCard>
  )
}

export function ScrabbleGamePanel({
  session,
  players,
  playerStates,
  myPlayerId,
  isMyTurn,
  tileValues,
  alphabet,
  onPlay,
  onExchange,
  onPass,
  acting,
}: {
  session: ScrabbleSession
  players: Player[]
  playerStates: ScrabblePlayerState[]
  myPlayerId: string | null
  isMyTurn: boolean
  tileValues: Record<string, number>
  alphabet: string[]
  onPlay?: (tiles: ScrabblePlacedTile[]) => Promise<void>
  onExchange?: (indices: number[]) => Promise<void>
  onPass?: () => Promise<void>
  acting?: boolean
}) {
  const [pending, setPending] = useState<PendingTile[]>([])
  const [selectedRackIndex, setSelectedRackIndex] = useState<number | null>(null)
  const [blankTarget, setBlankTarget] = useState<{ rackIndex: number; row: number; col: number } | null>(null)
  const [exchangeMode, setExchangeMode] = useState(false)
  const [exchangeSelection, setExchangeSelection] = useState<number[]>([])
  // Cosmetic-only display order of the rack (indices into the TRUE rack). Never sent to the server.
  const [rackOrder, setRackOrder] = useState<number[] | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const finished = session.phase === 'finished'
  const interactive = !!onPlay && isMyTurn && !finished && !acting

  const myState = playerStates.find((s) => s.player_id === myPlayerId)
  const rack = myState?.rack ?? []
  const usedRackIndices = useMemo(() => new Set(pending.map((p) => p.rackIndex)), [pending])

  // Reconcile the cosmetic rack order whenever the rack CONTENTS change (length or letter multiset).
  // This guarantees the order indices never point at a stale/wrong tile after a play/exchange/refill.
  const rackSigRef = useRef<string | null>(null)
  useEffect(() => {
    const sig = `${rack.length}:${[...rack].sort().join('')}`
    if (rackSigRef.current !== sig) {
      rackSigRef.current = sig
      setRackOrder(null)
    }
  }, [rack])

  // When your turn ends — including when the timer runs out — return any tentatively
  // placed (un-submitted) tiles to the rack and drop any in-progress selections.
  useEffect(() => {
    if (!isMyTurn) {
      setPending([])
      setSelectedRackIndex(null)
      setBlankTarget(null)
      setExchangeMode(false)
      setExchangeSelection([])
    }
  }, [isMyTurn])

  const orderedRackIndices = useMemo(() => {
    if (rackOrder && rackOrder.length === rack.length) return rackOrder
    return rack.map((_, i) => i)
  }, [rackOrder, rack])
  const rackTileIds = useMemo(() => orderedRackIndices.map((i) => `${TILE_PREFIX}${i}`), [orderedRackIndices])

  const turnPlayerId = currentTurnPlayerId(session)
  const turnPlayer = players.find((p) => p.id === turnPlayerId)

  const placed: ScrabblePlacedTile[] = useMemo(
    () => pending.map(({ row, col, letter, isBlank }) => ({ row, col, letter, isBlank })),
    [pending]
  )
  const preview = useMemo(() => scorePlacement(session.board, placed, tileValues), [session.board, placed, tileValues])

  const stateByPlayer = useMemo(() => {
    const m = new Map<string, ScrabblePlayerState>()
    for (const s of playerStates) m.set(s.player_id, s)
    return m
  }, [playerStates])
  const topScore = useMemo(() => Math.max(0, ...playerStates.map((s) => s.score)), [playerStates])

  const { secondsLeft, hasTimer, urgent: timerUrgent } = useScrabbleTurnTimer(session)
  useScrabbleTurnSound(session, myPlayerId, true)

  const pendingAt = (row: number, col: number) => pending.find((p) => p.row === row && p.col === col)

  // ── Sensors ─────────────────────────────────────────────────────────────────
  // The distance/delay activation constraints mean a short tap is NOT swallowed as a
  // drag, so the existing tile/cell onClick handlers (tap-to-place) still fire.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Interaction ───────────────────────────────────────────────────────────
  const clearPending = () => {
    setPending([])
    setSelectedRackIndex(null)
    setBlankTarget(null)
  }

  /** Place a rack tile onto an empty board cell (pending). Blanks open the letter picker first. */
  const placeTile = (rackIndex: number, row: number, col: number) => {
    if (usedRackIndices.has(rackIndex)) return
    const rackLetter = rack[rackIndex]
    if (rackLetter == null) return
    if (session.board[row][col]) return // committed tile already here
    if (pendingAt(row, col)) return // another pending tile already here
    if (rackLetter === '?') {
      setBlankTarget({ rackIndex, row, col })
      return
    }
    setPending((prev) => [...prev, { row, col, letter: rackLetter, isBlank: false, rackIndex }])
    setSelectedRackIndex(null)
  }

  /** Move an already-placed pending tile to a different empty cell. */
  const movePending = (row: number, col: number, nextRow: number, nextCol: number) => {
    setPending((prev) => {
      const tile = prev.find((p) => p.row === row && p.col === col)
      if (!tile) return prev
      if (session.board[nextRow][nextCol]) return prev
      if (prev.some((p) => p.row === nextRow && p.col === nextCol)) return prev
      return prev.map((p) => (p.row === row && p.col === col ? { ...p, row: nextRow, col: nextCol } : p))
    })
  }

  const recallPendingAt = (row: number, col: number) => {
    setPending((prev) => prev.filter((p) => !(p.row === row && p.col === col)))
  }

  const handleRackTap = (index: number) => {
    if (!interactive) return
    if (usedRackIndices.has(index)) return
    if (exchangeMode) {
      setExchangeSelection((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]))
      return
    }
    setSelectedRackIndex((prev) => (prev === index ? null : index))
  }

  const handleSquareTap = (row: number, col: number) => {
    if (!interactive || exchangeMode) return
    const existingPending = pendingAt(row, col)
    if (existingPending) {
      recallPendingAt(row, col) // tap a pending tile to recall it
      return
    }
    if (session.board[row][col]) return // occupied by a committed tile
    if (selectedRackIndex == null) return
    placeTile(selectedRackIndex, row, col)
  }

  const shuffleRack = () => {
    if (rack.length < 2) return
    const idx = rack.map((_, i) => i)
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[idx[i], idx[j]] = [idx[j], idx[i]]
    }
    setRackOrder(idx)
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  // When dragging a rack tile, prefer a rack tile sitting directly under the pointer so
  // it reorders within the rack. Without this, closestCenter measures against the board's
  // 225 cells — one of which is almost always nearer than the neighbouring tile — so a
  // rack-reorder drag gets mis-read as a board placement and the tiles never move.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    if (String(args.active.id).startsWith(TILE_PREFIX)) {
      const overTiles = pointerWithin(args).filter((c) => String(c.id).startsWith(TILE_PREFIX))
      if (overTiles.length > 0) return overTiles
    }
    return closestCenter(args)
  }, [])

  const onDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    setActiveDragId(null)

    if (activeId.startsWith(TILE_PREFIX)) {
      const rackIndex = Number(activeId.slice(TILE_PREFIX.length))
      if (overId == null) return
      if (overId.startsWith(CELL_PREFIX)) {
        const [r, c] = overId.slice(CELL_PREFIX.length).split('-').map(Number)
        placeTile(rackIndex, r, c)
      } else if (overId.startsWith(TILE_PREFIX)) {
        const overIndex = Number(overId.slice(TILE_PREFIX.length))
        if (overIndex === rackIndex) return
        const order = rackOrder && rackOrder.length === rack.length ? rackOrder : rack.map((_, i) => i)
        const from = order.indexOf(rackIndex)
        const to = order.indexOf(overIndex)
        if (from < 0 || to < 0) return
        setRackOrder(arrayMove(order, from, to))
      }
      return
    }

    if (activeId.startsWith(PENDING_PREFIX)) {
      const [r, c] = activeId.slice(PENDING_PREFIX.length).split('-').map(Number)
      if (overId && overId.startsWith(CELL_PREFIX)) {
        const [nr, nc] = overId.slice(CELL_PREFIX.length).split('-').map(Number)
        movePending(r, c, nr, nc)
      } else {
        // Dropped off the board / back onto the rack → recall.
        recallPendingAt(r, c)
      }
    }
  }

  const dragOverlay = useMemo(() => {
    if (!activeDragId) return null
    if (activeDragId.startsWith(TILE_PREFIX)) {
      const letter = rack[Number(activeDragId.slice(TILE_PREFIX.length))]
      if (letter == null) return null
      return (
        <LetterTile
          letter={letter === '?' ? ' ' : letter}
          isBlank={letter === '?'}
          tileValues={tileValues}
          size="rack"
        />
      )
    }
    if (activeDragId.startsWith(PENDING_PREFIX)) {
      const [r, c] = activeDragId.slice(PENDING_PREFIX.length).split('-').map(Number)
      const t = pending.find((p) => p.row === r && p.col === c)
      if (!t) return null
      return <LetterTile letter={t.letter} isBlank={t.isBlank} tileValues={tileValues} size="rack" />
    }
    return null
  }, [activeDragId, rack, pending, tileValues])

  const chooseBlankLetter = (letter: string) => {
    if (!blankTarget) return
    setPending((prev) => [
      ...prev,
      { row: blankTarget.row, col: blankTarget.col, letter, isBlank: true, rackIndex: blankTarget.rackIndex },
    ])
    setBlankTarget(null)
    setSelectedRackIndex(null)
  }

  const enterExchange = () => {
    clearPending()
    setExchangeSelection([])
    setExchangeMode(true)
  }
  const cancelExchange = () => {
    setExchangeMode(false)
    setExchangeSelection([])
  }

  const submitPlay = async () => {
    if (!onPlay || !preview.valid || placed.length === 0) return
    await onPlay(placed)
    clearPending()
  }
  const submitExchange = async () => {
    if (!onExchange || exchangeSelection.length === 0) return
    await onExchange(exchangeSelection)
    cancelExchange()
  }
  const submitPass = async () => {
    if (!onPass) return
    clearPending()
    await onPass()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const lastMove = session.last_move
  const lastMovePlayer = lastMove ? players.find((p) => p.id === lastMove.player_id) : null
  // Shuffling/arranging is purely cosmetic, so allow it whenever you hold tiles —
  // even when it isn't your turn.
  const showShuffle = !!myState && !finished && !exchangeMode && rack.length > 1

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveDragId(null)}
      >
        {/* Mobile: compact sticky score bar so scores stay visible without scrolling */}
        <div className="lg:hidden sticky top-2 z-20 mb-3">
          <BoardScores
            session={session}
            players={players}
            stateByPlayer={stateByPlayer}
            turnPlayerId={turnPlayerId}
            myPlayerId={myPlayerId}
            finished={finished}
            topScore={topScore}
            compact
          />
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,20rem)] lg:gap-5 lg:items-start">
          <div className="space-y-4 min-w-0">
            <ScrabbleTurnBar
              turnPlayerName={turnPlayer?.name}
              isMyTurn={isMyTurn && !finished}
              statusMessage={session.status_message}
              secondsLeft={secondsLeft}
              showTimer={hasTimer}
              urgent={timerUrgent}
              tilesInBag={session.bag.length}
            />

            {lastMove && lastMovePlayer && (
              <p className="text-center text-xs text-faint">
                {lastMove.kind === 'play'
                  ? `${lastMovePlayer.name} played ${lastMove.words.join(', ')} for ${lastMove.score} pts`
                  : lastMove.kind === 'exchange'
                    ? `${lastMovePlayer.name} exchanged tiles`
                    : `${lastMovePlayer.name} passed`}
              </p>
            )}

            {/* Board */}
            <div className="max-w-md mx-auto w-full">
              <div
                className="grid rounded-lg overflow-hidden border-2 border-[var(--border-strong)] shadow-lg gap-px bg-[var(--border)]"
                style={{ gridTemplateColumns: `repeat(${SCRABBLE_BOARD_SIZE}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: SCRABBLE_BOARD_SIZE }).map((_, row) =>
                  Array.from({ length: SCRABBLE_BOARD_SIZE }).map((__, col) => {
                    const committed = session.board[row][col]
                    const pendingTile = pendingAt(row, col)
                    const isLastMoveCell = !!lastMove?.tiles?.some((t) => t.row === row && t.col === col)
                    return (
                      <BoardCell
                        key={`${row}-${col}`}
                        row={row}
                        col={col}
                        committed={committed}
                        pendingTile={pendingTile}
                        isLastMoveCell={isLastMoveCell}
                        interactive={interactive}
                        exchangeMode={exchangeMode}
                        tileValues={tileValues}
                        onTap={handleSquareTap}
                      />
                    )
                  })
                )}
              </div>
            </div>

            {/* Blank-letter picker */}
            {blankTarget && (
              <ScrabbleCard className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Choose a letter for the blank</p>
                  <button
                    type="button"
                    onClick={() => setBlankTarget(null)}
                    className="text-xs text-muted hover:text-[var(--foreground)]"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {alphabet.map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => chooseBlankLetter(letter)}
                      className="rounded-md border-2 border-[var(--border-strong)] py-1.5 text-sm font-black hover:bg-[var(--primary)]/10"
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </ScrabbleCard>
            )}

            {/* Rack */}
            {(myState || interactive) && (
              <div className="space-y-2">
                <div className="relative flex items-center justify-center min-h-[1.5rem]">
                  <p className="text-center text-xs">
                    {exchangeMode ? (
                      <span className="text-faint">Tap tiles to exchange</span>
                    ) : pending.length > 0 ? (
                      preview.valid ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-semibold text-[var(--foreground)]">{preview.words.join(', ')}</span>
                          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums">
                            +{preview.score}
                          </span>
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-600">{preview.error ?? 'Incomplete word'}</span>
                      )
                    ) : interactive ? (
                      <span className="text-faint">
                        {selectedRackIndex != null
                          ? 'Tap or drag a tile onto an empty square'
                          : 'Tap a tile then the board, or drag it across'}
                      </span>
                    ) : (
                      <span className="text-faint">Your rack</span>
                    )}
                  </p>
                  {showShuffle && (
                    <button
                      type="button"
                      onClick={shuffleRack}
                      title="Shuffle your rack"
                      className="absolute right-0 inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-inset-bg)] px-2 py-1 text-xs font-semibold text-muted hover:text-[var(--foreground)]"
                    >
                      🔀 <span className="hidden sm:inline">Shuffle</span>
                    </button>
                  )}
                </div>
                <SortableContext items={rackTileIds} strategy={horizontalListSortingStrategy}>
                  <div className="flex justify-center gap-1.5 sm:gap-2">
                    {orderedRackIndices.map((index) => {
                      const letter = rack[index]
                      const used = usedRackIndices.has(index)
                      const selected = !exchangeMode && selectedRackIndex === index
                      const exchangeSelected = exchangeMode && exchangeSelection.includes(index)
                      return (
                        <RackTile
                          key={index}
                          id={`${TILE_PREFIX}${index}`}
                          letter={letter}
                          used={used}
                          selected={selected}
                          exchangeSelected={exchangeSelected}
                          interactive={interactive}
                          disabled={!interactive || used || exchangeMode}
                          tileValues={tileValues}
                          onClick={() => handleRackTap(index)}
                        />
                      )
                    })}
                    {rack.length === 0 && <span className="text-xs text-faint py-2">No tiles</span>}
                  </div>
                </SortableContext>
              </div>
            )}

            {/* Action buttons */}
            {interactive && (
              <div className="space-y-2">
                {exchangeMode ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void submitExchange()}
                      disabled={exchangeSelection.length === 0 || acting}
                      className="btn-primary py-2.5 text-sm font-bold disabled:opacity-50"
                    >
                      {acting
                        ? '…'
                        : `Swap ${exchangeSelection.length || ''} tile${exchangeSelection.length === 1 ? '' : 's'}`}
                    </button>
                    <button
                      type="button"
                      onClick={cancelExchange}
                      disabled={acting}
                      className="btn-secondary py-2.5 text-sm font-semibold disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void submitPlay()}
                      disabled={pending.length === 0 || !preview.valid || acting}
                      className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm font-bold disabled:opacity-50"
                    >
                      {acting ? (
                        '…'
                      ) : (
                        <>
                          <span>Submit word</span>
                          {preview.valid && pending.length > 0 && (
                            <span className="rounded-md bg-white/25 px-2 py-0.5 text-sm tabular-nums">
                              +{preview.score}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={clearPending}
                        disabled={pending.length === 0 || acting}
                        className="btn-secondary py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        Recall
                      </button>
                      <button
                        type="button"
                        onClick={enterExchange}
                        disabled={acting || rack.length === 0}
                        className="btn-secondary py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        Exchange
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitPass()}
                        disabled={acting}
                        className="btn-secondary py-2.5 text-sm font-semibold disabled:opacity-50"
                      >
                        Pass
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Scores — desktop sidebar; mobile uses the sticky strip up top */}
          <div className="hidden lg:block lg:sticky lg:top-4">
            <BoardScores
              session={session}
              players={players}
              stateByPlayer={stateByPlayer}
              turnPlayerId={turnPlayerId}
              myPlayerId={myPlayerId}
              finished={finished}
              topScore={topScore}
            />
          </div>
        </div>

        <DragOverlay>{dragOverlay && <div className="w-9 sm:w-11 aspect-square">{dragOverlay}</div>}</DragOverlay>
      </DndContext>
    </div>
  )
}
