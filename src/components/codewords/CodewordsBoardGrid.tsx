'use client'

import { spymasterCellClass, cellColorClass } from '@/lib/codewords'
import type { CodewordsBoard, CodewordsCellType } from '@/types'

/** Scale board labels down as words get longer so they stay inside each cell. */
function boardWordTextClass(word: string): string {
  const len = word.length
  if (len > 18) return 'text-[6px] sm:text-[7px] leading-[1.1]'
  if (len > 14) return 'text-[7px] sm:text-[8px] leading-[1.1]'
  if (len > 11) return 'text-[7px] sm:text-[8px]'
  if (len > 9) return 'text-[8px] sm:text-[9px]'
  if (len > 7) return 'text-[9px] sm:text-[10px]'
  return 'text-[10px] sm:text-xs'
}

type CodewordsBoardGridProps = {
  board: CodewordsBoard
  showKey?: boolean
  onGuess?: (index: number) => void
  guessable?: boolean
  disabled?: boolean
  cellAttribution?: Record<number, string>
}

export function CodewordsBoardGrid({
  board,
  showKey = false,
  onGuess,
  guessable = false,
  disabled = false,
  cellAttribution,
}: CodewordsBoardGridProps) {
  const revealed = new Set(board.revealed_indices)
  const key = board.key as CodewordsCellType[]

  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2 w-full max-w-2xl mx-auto">
      {board.words.map((word, index) => {
        const isRevealed = revealed.has(index)
        const cellType = key[index]
        const canTap = guessable && !disabled && !isRevealed && onGuess

        const className = showKey
          ? spymasterCellClass(cellType, isRevealed)
          : isRevealed
            ? cellColorClass(cellType, true)
            : 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)] text-[var(--foreground)]/90 hover:bg-[var(--surface-inset-bg)]'

        return (
          <button
            key={index}
            type="button"
            disabled={!canTap}
            onClick={() => onGuess?.(index)}
            className={[
              'flex min-h-[3.25rem] sm:min-h-[4rem] flex-col items-center justify-center overflow-hidden rounded-lg border-2 px-1 py-1.5 font-bold leading-tight transition-all',
              className,
              canTap ? 'cursor-pointer hover:scale-[1.02] ring-2 ring-blue-400/30' : '',
              !canTap && !isRevealed ? 'cursor-default' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span
              className={[
                'block w-full max-w-full text-center break-words hyphens-auto',
                boardWordTextClass(word),
              ].join(' ')}
            >
              {word}
            </span>
            {isRevealed && cellAttribution?.[index] && (
              <span className="block text-[9px] font-semibold opacity-80 mt-0.5 truncate">
                {cellAttribution[index]}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function CodewordsTeamBadge({ team }: { team: 'red' | 'blue' }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide',
        team === 'red'
          ? 'bg-red-100 text-red-800 dark:bg-red-500/25 dark:text-red-100'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-500/25 dark:text-blue-100',
      ].join(' ')}
    >
      {team === 'red' ? '🔴 Red' : '🔵 Blue'}
    </span>
  )
}
