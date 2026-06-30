'use client'

import { cellBlockIndex, getCellDisplayColor, isCellInFlashingUnits, type SudokuUnitFlash } from '@/lib/sudoku'

interface SudokuBoardProps {
  puzzle: number[][]
  solution?: number[][]
  userGrid?: number[][]
  cellOwners?: (string | null)[][]
  mySolvedCells?: boolean[][]
  playerColors?: Record<string, string>
  myPlayerId?: string | null
  selectedCell?: [number, number] | null
  onCellSelect?: (row: number, col: number) => void
  onNumberPress?: (value: number) => void
  onErase?: () => void
  onUndo?: () => void
  undoDisabled?: boolean
  draftWrongCells?: boolean[][]
  completionPercent?: number
  readOnly?: boolean
  /** When set, controls which cells the player can tap (overrides default claimed-cell lock). */
  canSelectCell?: (row: number, col: number) => boolean
  /** Brief highlight on rows/cols/boxes the player just completed. */
  flashUnits?: SudokuUnitFlash[]
}

const BLOCK_BORDER = 'border-slate-400/70'

export function SudokuBoard({
  puzzle,
  solution,
  userGrid,
  cellOwners,
  mySolvedCells,
  playerColors = {},
  myPlayerId,
  selectedCell,
  onCellSelect,
  onNumberPress,
  onErase,
  onUndo,
  undoDisabled = false,
  draftWrongCells,
  completionPercent = 0,
  readOnly = false,
  canSelectCell,
  flashUnits = [],
}: SudokuBoardProps) {
  return (
    <div className="w-full max-w-[min(400px,100%)] mx-auto space-y-4">
      {/* Grid */}
      <div
        className="grid border-2 border-slate-500/80 rounded-sm overflow-hidden bg-white dark:bg-slate-900"
        style={{ gridTemplateColumns: 'repeat(9, 1fr)', aspectRatio: '1' }}
      >
        {Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 9 }, (_, col) => {
            const given = puzzle[row]?.[col] !== 0
            const firstSolverId = cellOwners?.[row]?.[col] ?? null
            const iSolved = !!mySolvedCells?.[row]?.[col]
            const isSelected = selectedCell?.[0] === row && selectedCell?.[1] === col

            let displayValue: number | string
            if (given) {
              displayValue = puzzle[row]![col]!
            } else if (solution) {
              displayValue = solution[row]![col]!
            } else {
              const v = userGrid?.[row]?.[col]
              displayValue = v && v > 0 ? v : ''
            }

            const hasValue = given || (typeof displayValue === 'number' ? displayValue > 0 : !!displayValue)

            const displayColor = getCellDisplayColor(row, col, {
              myPlayerId,
              mySolvedCells,
              firstSolverId,
              playerColors,
            })

            const borderRight =
              (col + 1) % 3 === 0 && col < 8 ? `border-r-2 ${BLOCK_BORDER}` : 'border-r border-slate-300/60'
            const borderBottom =
              (row + 1) % 3 === 0 && row < 8 ? `border-b-2 ${BLOCK_BORDER}` : 'border-b border-slate-300/60'

            const isWrongDraft = draftWrongCells?.[row]?.[col]
            const isFlashing = isCellInFlashingUnits(row, col, flashUnits)

            const baseBg = displayColor
              ? { backgroundColor: `${displayColor}${iSolved ? '55' : '35'}` }
              : isSelected
                ? { backgroundColor: 'rgba(148, 163, 184, 0.25)' }
                : undefined

            const bgStyle = isFlashing
              ? { backgroundColor: 'rgba(251, 191, 36, 0.55)', transition: 'background-color 0.5s ease-out' }
              : baseBg
                ? { ...baseBg, transition: 'background-color 0.5s ease-out' }
                : undefined

            const cellDisabled = readOnly || given || (canSelectCell ? !canSelectCell(row, col) : false)

            return (
              <button
                key={`${row}-${col}`}
                type="button"
                disabled={cellDisabled}
                onClick={() => onCellSelect?.(row, col)}
                className={[
                  'relative flex items-center justify-center select-none transition-colors',
                  borderRight,
                  borderBottom,
                  cellDisabled ? 'cursor-default' : 'cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-800/60',
                  given ? 'bg-white dark:bg-slate-900' : '',
                ].join(' ')}
                style={{ aspectRatio: '1', ...bgStyle }}
              >
                <span
                  className={[
                    'text-lg sm:text-xl font-semibold tabular-nums',
                    given ? 'text-slate-800 dark:text-slate-100' : '',
                    isWrongDraft ? 'text-red-500 dark:text-red-400' : '',
                    !isWrongDraft && hasValue ? 'text-slate-800 dark:text-slate-100' : '',
                    !isWrongDraft && !hasValue ? 'text-slate-700 dark:text-slate-200' : '',
                    solution && !given ? 'text-violet-600 dark:text-violet-400' : '',
                  ].join(' ')}
                >
                  {displayValue}
                </span>
              </button>
            )
          })
        )}
      </div>

      {/* Toolbar: progress, undo, erase */}
      {!readOnly && (
        <div className="flex items-center justify-around px-1">
          <ToolbarButton label={`${completionPercent}%`} disabled>
            <StarIcon />
          </ToolbarButton>
          {onUndo && (
            <ToolbarButton label="Undo" onClick={onUndo} disabled={undoDisabled}>
              <UndoIcon />
            </ToolbarButton>
          )}
          {onErase && (
            <ToolbarButton label="Erase" onClick={onErase}>
              <EraseIcon />
            </ToolbarButton>
          )}
        </div>
      )}

      {/* Number pad */}
      {!readOnly && onNumberPress && (
        <div className="flex items-center justify-between gap-1 px-0.5">
          {Array.from({ length: 9 }, (_, i) => {
            const num = i + 1
            return (
              <button
                key={num}
                type="button"
                onClick={() => onNumberPress(num)}
                className="flex-1 py-3 text-xl font-semibold text-slate-700 dark:text-slate-200 bg-slate-100/80 dark:bg-slate-800/50 hover:bg-slate-200/90 dark:hover:bg-slate-700/60 rounded-md transition-colors active:scale-95 cursor-pointer"
              >
                {num}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
      <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6L5.7 21l2.3-7-6-4.6h7.6L12 2z" strokeLinejoin="round" />
    </svg>
  )
}

function ToolbarButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'flex flex-col items-center gap-0.5 min-w-[3.25rem] py-1 rounded-lg transition-colors',
        'text-slate-500 dark:text-slate-400',
        disabled ? 'opacity-50 cursor-default' : 'hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer',
      ].join(' ')}
    >
      <span className="w-6 h-6 flex items-center justify-center">{children}</span>
      <span className="text-[10px] font-medium leading-tight">{label}</span>
    </button>
  )
}

function UndoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
      <path d="M9 7H5v4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 11a7 7 0 107 7" strokeLinecap="round" />
    </svg>
  )
}

function EraseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5">
      <path d="M20 20H8L4 16l8-8 8 8-4 4z" strokeLinejoin="round" />
      <path d="M12 6l6 6" strokeLinecap="round" />
    </svg>
  )
}

export { cellBlockIndex }
