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
  /** Correctly placed number to pulse across matching visible cells. */
  correctPulseValue?: number | null
  /** Incrementing id that restarts the correct placement pulse. */
  correctPulseId?: number
  /** Numbers whose nine instances are solved for this board/player. */
  completedNumbers?: number[]
  /** When set, all cells containing this number get a light-blue same-number highlight. */
  highlightNumber?: number | null
}

/** 3x3 sub-block dividers. Uses inline border-color so a per-game theme
 *  (Newsprint Sudoku ink-black, Minimalist hairline gray) actually
 *  repaints the grid — a Tailwind color class would be baked in. */
const BLOCK_BORDER_STYLE = { borderColor: 'var(--game-board-block)' } as const
/** Thin intra-cell grid lines — same story. */
const GRID_LINE_STYLE = { borderColor: 'var(--game-board-grid)' } as const

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
  correctPulseValue = null,
  correctPulseId = 0,
  completedNumbers = [],
  highlightNumber = null,
}: SudokuBoardProps) {
  const completedSet = new Set(completedNumbers)
  return (
    <div className="w-full max-w-[min(400px,100%)] mx-auto space-y-4">
      {/* Grid */}
      <div
        className="grid border-2 rounded-sm overflow-hidden"
        style={{
          gridTemplateColumns: 'repeat(9, 1fr)',
          aspectRatio: '1',
          // Board surface + outer border read from --game-* tokens so a
          // paid theme (Newsprint cream, Minimalist white) repaints them.
          background: 'var(--game-board-bg)',
          borderColor: 'var(--game-board-block)',
        }}
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

            const isBlockRight = (col + 1) % 3 === 0 && col < 8
            const isBlockBottom = (row + 1) % 3 === 0 && row < 8
            const borderRight = isBlockRight ? 'border-r-2' : 'border-r'
            const borderBottom = isBlockBottom ? 'border-b-2' : 'border-b'
            const borderStyle: React.CSSProperties = {
              borderRightColor: isBlockRight ? BLOCK_BORDER_STYLE.borderColor : GRID_LINE_STYLE.borderColor,
              borderBottomColor: isBlockBottom ? BLOCK_BORDER_STYLE.borderColor : GRID_LINE_STYLE.borderColor,
            }

            const isWrongDraft = draftWrongCells?.[row]?.[col]
            const isFlashing = isCellInFlashingUnits(row, col, flashUnits)
            const isCorrectPulsing =
              correctPulseValue != null && typeof displayValue === 'number' && displayValue === correctPulseValue
            const isNumberHighlighted =
              highlightNumber != null &&
              typeof displayValue === 'number' &&
              displayValue === highlightNumber &&
              displayValue > 0

            const baseBg = displayColor ? { backgroundColor: `${displayColor}${iSolved ? '55' : '35'}` } : undefined

            const bgStyle = isSelected
              ? { backgroundColor: 'var(--game-selected-bg)', transition: 'background-color 0.15s ease-out' }
              : isFlashing
                ? // Wrong-flash amber is a semantic error state — kept
                  // hardcoded on purpose. Themes that want a monochrome
                  // flash can override --game-flash-bg in a follow-up.
                  { backgroundColor: 'rgba(251, 191, 36, 0.55)', transition: 'background-color 0.5s ease-out' }
                : isNumberHighlighted
                  ? { backgroundColor: 'var(--game-highlight-bg)', transition: 'background-color 0.15s ease-out' }
                  : baseBg
                    ? { ...baseBg, transition: 'background-color 0.5s ease-out' }
                    : undefined

            // readOnly = board is entirely non-interactive (viewer/host read-only board)
            const cellFullyDisabled = readOnly
            // cellUneditable = can't type into it, but can still click to trigger number highlight
            const cellUneditable = given || (canSelectCell ? !canSelectCell(row, col) : false)

            const cellLabel = [
              `Row ${row + 1}, column ${col + 1}`,
              given
                ? `given ${displayValue}`
                : hasValue
                  ? `value ${displayValue}`
                  : firstSolverId
                    ? 'claimed'
                    : 'empty',
            ].join(', ')

            return (
              <button
                key={`${row}-${col}`}
                type="button"
                disabled={cellFullyDisabled}
                aria-label={cellLabel}
                aria-pressed={isSelected || undefined}
                onClick={() => onCellSelect?.(row, col)}
                className={[
                  'relative flex items-center justify-center select-none transition-colors',
                  borderRight,
                  borderBottom,
                  cellFullyDisabled || cellUneditable ? 'cursor-default' : 'cursor-pointer',
                  isSelected ? 'ring-2 ring-inset z-10' : '',
                ].join(' ')}
                style={{
                  aspectRatio: '1',
                  ...borderStyle,
                  // Cell surface — given cells use the board bg; empty
                  // cells inherit. Selected cells add the accent ring
                  // colour so it matches the paid theme.
                  ...(given ? { backgroundColor: 'var(--game-board-bg)' } : {}),
                  ...(isSelected ? { boxShadow: 'inset 0 0 0 2px var(--game-accent)' } : {}),
                  ...bgStyle,
                }}
              >
                <span
                  key={isCorrectPulsing ? `${row}-${col}-${correctPulseId}` : `${row}-${col}`}
                  className={[
                    'inline-block text-lg sm:text-xl font-semibold tabular-nums',
                    isCorrectPulsing ? 'font-extrabold' : '',
                    // Wrong-draft red is a semantic error state — kept as
                    // Tailwind so themes don't accidentally hide the
                    // "you got it wrong" signal.
                    isWrongDraft ? 'text-red-500 dark:text-red-400' : '',
                  ].join(' ')}
                  style={{
                    // Digit color reads --game-board-fg so a theme's ink
                    // colour (Newsprint sepia, Minimalist black) paints
                    // the numbers. Only applies when the cell isn't in a
                    // wrong-draft error state above.
                    ...(!isWrongDraft ? { color: 'var(--game-board-fg)' } : {}),
                    // solution-preview digits stay accent-tinted so a
                    // reviewer can distinguish player entries from the
                    // reveal.
                    ...(solution && !given && !isWrongDraft ? { color: 'var(--game-accent)' } : {}),
                    ...(isCorrectPulsing
                      ? {
                          animation: 'sudoku-correct-number-pulse 420ms ease-out both',
                          animationDelay: `${(row * 9 + col) * 18}ms`,
                        }
                      : {}),
                  }}
                >
                  {displayValue}
                </span>
              </button>
            )
          })
        )}
      </div>

      <style>{`
        @keyframes sudoku-correct-number-pulse {
          0% { transform: scale(1); }
          38% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      `}</style>

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
            const complete = completedSet.has(num)
            return (
              <button
                key={num}
                type="button"
                onClick={() => onNumberPress(num)}
                // Number-pad default state reads --card / --foreground
                // so Newsprint pad = cream + ink, Neon dark pad =
                // midnight + cyan-tinted text. 'Complete' emerald state
                // is a semantic success signal — stays hardcoded so a
                // theme can't hide the "you solved this number" feedback.
                className={[
                  'flex-1 py-3 text-xl font-semibold rounded-md transition-colors active:scale-95 cursor-pointer',
                  complete
                    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-900/35 hover:bg-emerald-100 dark:hover:bg-emerald-900/45'
                    : 'text-body bg-[var(--card)] hover:bg-[var(--card-hover)]',
                ].join(' ')}
                aria-label={complete ? `${num} complete` : `${num}`}
                title={complete ? `${num} complete` : undefined}
              >
                {complete ? '✓' : num}
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
      // Toolbar button text/hover reads --muted → --body so a themed
      // toolbar (Newsprint sepia ink, Neon glowing cyan) reads
      // consistently with the rest of the game screen.
      className={[
        'flex flex-col items-center gap-0.5 min-w-[3.25rem] py-1 rounded-lg transition-colors',
        'text-muted',
        disabled ? 'opacity-50 cursor-default' : 'hover:text-body cursor-pointer',
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
      <path d="M3 9h13a5 5 0 0 1 0 10H7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 5l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
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
