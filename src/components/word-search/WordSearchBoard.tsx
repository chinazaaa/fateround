'use client'

import { useRef, useState } from 'react'
import { selectionCells, type WordSearchMetadata } from '@/lib/word-search'

/** Board-agnostic palette used to colour each player's found cells (mirrors CrosswordBoard). */
const WORD_SEARCH_PALETTE = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#0ea5e9',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#f97316',
  '#84cc16',
]

export function wordSearchPlayerColor(index: number): string {
  return WORD_SEARCH_PALETTE[index % WORD_SEARCH_PALETTE.length]
}

/** Colour of the current player's own found cells. */
export const WORD_SEARCH_MY_CELL_COLOR = '#6366f1'

const cellKey = (row: number, col: number) => `${row}-${col}`

/**
 * Snap a raw drag endpoint to the nearest straight line (horizontal, vertical, or 45°
 * diagonal) from `start`, clamped to the grid. Words can run in any of the 8 directions,
 * and a drag may trace a word backwards, so all 8 directions are candidates.
 */
function snapLine(start: [number, number], end: [number, number], size: number): [number, number] {
  const [r0, c0] = start
  const [r1, c1] = end
  const vr = r1 - r0
  const vc = c1 - c0
  if (vr === 0 && vc === 0) return start
  const dirs: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]
  let best: [number, number] = dirs[0]
  let bestProj = -Infinity
  for (const [dr, dc] of dirs) {
    const len = Math.hypot(dr, dc)
    const proj = (vr * dr + vc * dc) / len
    if (proj > bestProj) {
      bestProj = proj
      best = [dr, dc]
    }
  }
  const [dr, dc] = best
  let steps = Math.round((vr * dr + vc * dc) / (dr * dr + dc * dc))
  if (steps < 1) steps = 1
  // Clamp so the whole line stays on the board.
  let maxSteps = steps
  for (let s = 1; s <= steps; s++) {
    const rr = r0 + dr * s
    const cc = c0 + dc * s
    if (rr < 0 || rr >= size || cc < 0 || cc >= size) {
      maxSteps = s - 1
      break
    }
  }
  return [r0 + dr * maxSteps, c0 + dc * maxSteps]
}

interface WordSearchBoardProps {
  metadata: WordSearchMetadata
  /** First finder per cell, for ownership colouring. */
  cellOwners?: (string | null)[][]
  /** Cells the current player has found (stronger own-colour fill). */
  myFoundCells?: boolean[][]
  playerColors?: Record<string, string>
  myPlayerId?: string | null
  myColor?: string
  /** Cells from a just-rejected selection, briefly flashed red. */
  invalidCells?: Set<string>
  /** Called with the drag endpoints (grid order) when the player releases a selection. */
  onSelect?: (start: [number, number], end: [number, number]) => void
  readOnly?: boolean
}

export function WordSearchBoard({
  metadata,
  cellOwners,
  myFoundCells,
  playerColors = {},
  myPlayerId,
  myColor = WORD_SEARCH_MY_CELL_COLOR,
  invalidCells,
  onSelect,
  readOnly = false,
}: WordSearchBoardProps) {
  const size = metadata.size
  const gridRef = useRef<HTMLDivElement>(null)
  const [dragStart, setDragStart] = useState<[number, number] | null>(null)
  const [dragEnd, setDragEnd] = useState<[number, number] | null>(null)

  function cellFromEvent(e: React.PointerEvent): [number, number] | null {
    const el = gridRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * size)
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * size)
    if (row < 0 || row >= size || col < 0 || col >= size) return null
    return [row, col]
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (readOnly) return
    const cell = cellFromEvent(e)
    if (!cell) return
    e.preventDefault()
    try {
      gridRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // capture is best-effort
    }
    setDragStart(cell)
    setDragEnd(cell)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (readOnly || !dragStart) return
    const cell = cellFromEvent(e)
    if (!cell) return
    setDragEnd(snapLine(dragStart, cell, size))
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (readOnly) return
    const s = dragStart
    const en = dragEnd
    setDragStart(null)
    setDragEnd(null)
    try {
      gridRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      // release is best-effort
    }
    if (!s || !en) return
    // A tap (no travel) isn't a selection.
    if (s[0] === en[0] && s[1] === en[1]) return
    onSelect?.(s, en)
  }

  const dragCells = new Set<string>()
  if (dragStart && dragEnd) {
    const cells = selectionCells(dragStart, dragEnd)
    if (cells) for (const [r, c] of cells) dragCells.add(cellKey(r, c))
  }

  return (
    <div className="w-full max-w-[min(460px,100%)] mx-auto">
      <div
        ref={gridRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="grid border-2 border-slate-500/80 rounded-sm overflow-hidden bg-white dark:bg-slate-900 select-none"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          aspectRatio: '1',
          touchAction: readOnly ? undefined : 'none',
        }}
      >
        {Array.from({ length: size }, (_, row) =>
          Array.from({ length: size }, (_, col) => {
            const letter = metadata.grid[row]?.[col] ?? ''
            const owner = cellOwners?.[row]?.[col] ?? null
            const iFound = !!myFoundCells?.[row]?.[col]
            const inDrag = dragCells.has(cellKey(row, col))
            const invalid = invalidCells?.has(cellKey(row, col)) ?? false

            const ownerColor = owner ? (owner === myPlayerId ? myColor : (playerColors[owner] ?? '#94a3b8')) : null
            const baseBg = ownerColor ? { backgroundColor: `${ownerColor}${iFound ? '55' : '33'}` } : undefined
            const bgStyle = invalid
              ? { backgroundColor: 'rgba(239, 68, 68, 0.35)' }
              : inDrag
                ? { backgroundColor: 'rgba(99, 102, 241, 0.35)' }
                : baseBg

            return (
              <div
                key={cellKey(row, col)}
                aria-label={`Row ${row + 1}, column ${col + 1}, letter ${letter}`}
                className={[
                  'relative flex items-center justify-center transition-colors',
                  'border-r border-b border-slate-300/60 dark:border-slate-700/50',
                  inDrag ? 'ring-2 ring-indigo-500 ring-inset z-10' : '',
                ].join(' ')}
                style={{ aspectRatio: '1', ...bgStyle }}
              >
                <span
                  className={[
                    'inline-block font-bold uppercase leading-none pointer-events-none',
                    size > 11 ? 'text-[11px] sm:text-sm' : 'text-sm sm:text-lg',
                    'text-slate-800 dark:text-slate-100',
                  ].join(' ')}
                >
                  {letter}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
