'use client'

import { BINGO_COLUMNS, BINGO_FREE_INDEX, formatBingoNumber } from '@/lib/bingo'

type BingoCardGridProps = {
  cells: number[]
  markedIndices: number[]
  calledNumbers?: number[]
  onMark?: (index: number) => void
  disabled?: boolean
  compact?: boolean
}

export function BingoCardGrid({
  cells,
  markedIndices,
  calledNumbers = [],
  onMark,
  disabled = false,
  compact = false,
}: BingoCardGridProps) {
  const marked = new Set(markedIndices)
  const called = new Set(calledNumbers)
  const cellClass = compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="grid grid-cols-5 gap-1 mb-1">
        {BINGO_COLUMNS.map((letter) => (
          <div
            key={letter}
            className={`text-center font-black tracking-wide text-blue-400 ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}
          >
            {letter}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {cells.map((cell, index) => {
          const isFree = index === BINGO_FREE_INDEX || cell === 0
          const isMarked = marked.has(index)
          const isCalled = !isFree && called.has(cell)
          const canTap = !disabled && onMark && !isMarked && isCalled

          let stateClass: string
          if (isFree) {
            stateClass = isMarked
              ? 'border-amber-600 bg-amber-200 text-amber-950 dark:border-amber-400 dark:bg-amber-500/35 dark:text-amber-50'
              : 'border-amber-500 bg-amber-100 text-amber-950 dark:border-amber-400/70 dark:bg-amber-500/25 dark:text-amber-50'
          } else if (isMarked) {
            stateClass =
              'border-emerald-600 bg-emerald-200 text-emerald-950 scale-[0.98] dark:border-emerald-400 dark:bg-emerald-500/35 dark:text-emerald-50'
          } else if (isCalled) {
            stateClass =
              'border-blue-600 bg-blue-100 text-blue-950 shadow-sm ring-2 ring-blue-400/40 hover:bg-blue-200 dark:border-blue-400 dark:bg-blue-500/30 dark:text-blue-50 dark:hover:bg-blue-500/40 cursor-pointer'
          } else {
            stateClass =
              'border-[var(--border-strong)] bg-[var(--surface-inset-bg)] text-[var(--foreground)]/75 dark:text-muted'
          }

          return (
            <button
              key={index}
              type="button"
              disabled={!canTap}
              onClick={() => onMark?.(index)}
              className={[
                'aspect-square rounded-lg border-2 font-bold transition-all',
                cellClass,
                stateClass,
                !canTap && !isMarked && !isFree ? 'cursor-default' : '',
                isFree ? 'text-[10px] sm:text-xs leading-tight' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {isFree ? 'FREE' : cell}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CalledNumbersBoard({
  calledNumbers,
  lastCalled,
}: {
  calledNumbers: number[]
  lastCalled?: number | null
}) {
  const called = new Set(calledNumbers)

  return (
    <div className="space-y-3">
      {lastCalled != null && (
        <div className="text-center">
          <p className="text-faint text-xs uppercase tracking-wider mb-1">Latest call</p>
          <p className="text-3xl font-black text-blue-300">{formatBingoNumber(lastCalled)}</p>
        </div>
      )}
      <div className="grid grid-cols-5 gap-2">
        {BINGO_COLUMNS.map((letter, colIndex) => {
          const [min, max] =
            colIndex === 0
              ? [1, 15]
              : colIndex === 1
                ? [16, 30]
                : colIndex === 2
                  ? [31, 45]
                  : colIndex === 3
                    ? [46, 60]
                    : [61, 75]
          const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i)

          return (
            <div key={letter} className="space-y-1">
              <p className="text-center text-xs font-bold text-blue-400">{letter}</p>
              {nums.map((n) => (
                <div
                  key={n}
                  className={[
                    'text-center text-[10px] sm:text-xs py-0.5 rounded font-medium',
                    called.has(n)
                      ? 'bg-blue-200 text-blue-950 font-bold dark:bg-blue-500/35 dark:text-blue-50'
                      : 'text-[var(--foreground)]/60 bg-[var(--surface-inset-bg)]',
                  ].join(' ')}
                >
                  {n}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
