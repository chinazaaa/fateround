'use client'

import type { CrosswordMetadata } from '@/lib/crossword'

/** Board-agnostic palette used to colour each player's claimed cells. */
const CROSSWORD_PALETTE = [
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

export function crosswordPlayerColor(index: number): string {
  return CROSSWORD_PALETTE[index % CROSSWORD_PALETTE.length]
}

/** Colour of the current player's own solved cells. */
export const CROSSWORD_MY_CELL_COLOR = '#6366f1'

const cellKey = (row: number, col: number) => `${row}-${col}`

interface CrosswordBoardProps {
  metadata: CrosswordMetadata
  /** Letters to render per cell ('' = empty). */
  letterGrid: string[][]
  /** First correct solver per cell, for ownership colouring. */
  cellOwners?: (string | null)[][]
  /** Cells this player has correctly solved (get the stronger own-colour fill). */
  mySolvedCells?: boolean[][]
  playerColors?: Record<string, string>
  myPlayerId?: string | null
  myColor?: string
  selectedCell?: [number, number] | null
  /** Cells belonging to the active across/down word, softly highlighted. */
  activeCells?: Set<string>
  /** Cells currently holding an incorrect local guess (rendered red). */
  wrongCells?: boolean[][]
  onCellSelect?: (row: number, col: number) => void
  readOnly?: boolean
}

export function CrosswordBoard({
  metadata,
  letterGrid,
  cellOwners,
  mySolvedCells,
  playerColors = {},
  myPlayerId,
  myColor = CROSSWORD_MY_CELL_COLOR,
  selectedCell,
  activeCells,
  wrongCells,
  onCellSelect,
  readOnly = false,
}: CrosswordBoardProps) {
  const size = metadata.size

  return (
    <div className="w-full max-w-[min(460px,100%)] mx-auto">
      <div
        className="grid border-2 border-slate-500/80 rounded-sm overflow-hidden bg-white dark:bg-slate-900"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, aspectRatio: '1' }}
      >
        {Array.from({ length: size }, (_, row) =>
          Array.from({ length: size }, (_, col) => {
            const blocked = !!metadata.blocked[row]?.[col]
            if (blocked) {
              return (
                <div
                  key={cellKey(row, col)}
                  className="bg-slate-800 dark:bg-slate-950 border-r border-b border-slate-700/40"
                  style={{ aspectRatio: '1' }}
                  aria-hidden
                />
              )
            }

            const number = metadata.numbers?.[row]?.[col] ?? 0
            const letter = letterGrid[row]?.[col] ?? ''
            const owner = cellOwners?.[row]?.[col] ?? null
            const iSolved = !!mySolvedCells?.[row]?.[col]
            const isWrong = !!wrongCells?.[row]?.[col]
            const isSelected = selectedCell?.[0] === row && selectedCell?.[1] === col
            const isActive = activeCells?.has(cellKey(row, col)) ?? false

            const ownerColor = owner ? (owner === myPlayerId ? myColor : (playerColors[owner] ?? '#94a3b8')) : null
            const baseBg = ownerColor ? { backgroundColor: `${ownerColor}${iSolved ? '55' : '33'}` } : undefined

            const bgStyle = isSelected
              ? { backgroundColor: 'rgba(99, 102, 241, 0.35)' }
              : isActive
                ? { backgroundColor: 'rgba(99, 102, 241, 0.14)' }
                : baseBg

            return (
              <button
                key={cellKey(row, col)}
                type="button"
                disabled={readOnly}
                aria-label={`Row ${row + 1}, column ${col + 1}${number ? `, clue ${number}` : ''}${
                  letter ? `, letter ${letter}` : ', empty'
                }`}
                aria-pressed={isSelected || undefined}
                onClick={() => onCellSelect?.(row, col)}
                className={[
                  'relative flex items-center justify-center select-none transition-colors',
                  'border-r border-b border-slate-300/60 dark:border-slate-700/50',
                  readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/50',
                  isSelected ? 'ring-2 ring-indigo-500 ring-inset z-10' : '',
                ].join(' ')}
                style={{ aspectRatio: '1', ...bgStyle }}
              >
                {number > 0 && (
                  <span className="absolute top-0 left-0.5 text-[7px] sm:text-[9px] font-semibold leading-none text-slate-500 dark:text-slate-400">
                    {number}
                  </span>
                )}
                <span
                  className={[
                    'inline-block font-bold uppercase leading-none',
                    size > 11 ? 'text-[11px] sm:text-sm' : 'text-sm sm:text-lg',
                    isWrong ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-slate-100',
                  ].join(' ')}
                >
                  {letter}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
