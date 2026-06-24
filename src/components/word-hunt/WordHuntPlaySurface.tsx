'use client'

import { useCallback, useRef } from 'react'
import { rowColToIndex, wordFromPath, WORD_HUNT_MIN_WORD_LENGTH } from '@/lib/word-hunt'

type Props = {
  grid: string[][]
  selectedPath: number[]
  onPathChange: (path: number[]) => void
  foundWords: string[]
  myPoints: number
  timeLabel: string
  timeUp: boolean
  secondsLeft: number
  onClear: () => void
  onSubmit: () => void
  submitting?: boolean
  disabled?: boolean
}

export function WordHuntPlaySurface({
  grid,
  selectedPath,
  onPathChange,
  foundWords,
  myPoints,
  timeLabel,
  timeUp,
  secondsLeft,
  onClear,
  onSubmit,
  submitting = false,
  disabled = false,
}: Props) {
  const isDragging = useRef(false)
  const currentWord = wordFromPath(grid, selectedPath)
  const canSubmit = !submitting && !disabled && !timeUp && selectedPath.length >= WORD_HUNT_MIN_WORD_LENGTH
  const timerUrgent = !timeUp && secondsLeft <= 10

  const handleCell = useCallback(
    (index: number) => {
      if (disabled) return

      const current = selectedPath
      const existingIdx = current.indexOf(index)

      if (existingIdx >= 0) {
        if (existingIdx === current.length - 1) {
          onPathChange(current.slice(0, -1))
        }
        return
      }

      if (current.length === 0) {
        onPathChange([index])
        return
      }

      const last = current[current.length - 1]
      const [lr, lc] = [Math.floor(last / 4), last % 4]
      const [r, c] = [Math.floor(index / 4), index % 4]
      if (Math.abs(lr - r) <= 1 && Math.abs(lc - c) <= 1) {
        onPathChange([...current, index])
      }
    },
    [disabled, onPathChange, selectedPath]
  )

  return (
    <div className="glass-card-strong overflow-hidden border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] shadow-[var(--card-shadow-glow)]">
      <div className="grid grid-cols-2 gap-2 p-4 border-b border-[var(--border)]">
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] px-3 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted">Score</p>
          <p className="text-xl font-black tabular-nums text-[var(--foreground)] leading-tight">{myPoints}</p>
        </div>
        <div
          className={[
            'rounded-2xl border px-3 py-2.5 text-right',
            timerUrgent || timeUp
              ? 'border-[color-mix(in_srgb,var(--marry)_35%,var(--border))] bg-[color-mix(in_srgb,var(--marry)_8%,var(--card))]'
              : 'border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)]',
          ].join(' ')}
        >
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted">Time</p>
          <p
            className={[
              'text-xl font-black tabular-nums leading-tight',
              timeUp ? 'text-[var(--kill)]' : timerUrgent ? 'text-[var(--marry)]' : 'text-[var(--foreground)]',
            ].join(' ')}
          >
            {timeUp ? '0:00' : timeLabel}
          </p>
        </div>
      </div>

      <div className="px-4 pt-4 pb-3">
        <div
          className="surface-inset rounded-2xl p-2.5 sm:p-3 ring-1 ring-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
          onPointerUp={() => {
            isDragging.current = false
          }}
          onPointerLeave={() => {
            isDragging.current = false
          }}
        >
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {grid.map((row, r) =>
              row.map((letter, c) => {
                const index = rowColToIndex(r, c)
                const inPath = selectedPath.includes(index)
                const pathOrder = selectedPath.indexOf(index)
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={disabled}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      isDragging.current = true
                      handleCell(index)
                    }}
                    onPointerEnter={() => {
                      if (isDragging.current) handleCell(index)
                    }}
                    className={[
                      'aspect-square rounded-xl font-black text-lg sm:text-2xl flex items-center justify-center select-none touch-none transition-all duration-150',
                      inPath
                        ? 'bg-[color-mix(in_srgb,var(--marry)_22%,var(--card-strong))] text-[var(--slot-marry-text)] shadow-[0_0_0_2px_var(--marry),0_8px_20px_-6px_color-mix(in_srgb,var(--marry)_45%,transparent)] scale-[1.04] z-[1]'
                        : 'bg-[var(--card-strong)] text-[var(--foreground)] border border-[var(--border-strong)] shadow-[var(--card-shadow)] hover:border-[color-mix(in_srgb,var(--primary)_25%,var(--border))]',
                      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.97]',
                    ].join(' ')}
                  >
                    <span className="relative">
                      {letter}
                      {inPath && pathOrder >= 0 && (
                        <span className="absolute -top-2.5 -right-3 text-[8px] font-black text-[var(--marry)]">
                          {pathOrder + 1}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="px-4 space-y-3">
        <div
          className={[
            'min-h-[3.25rem] rounded-2xl border px-4 flex items-center justify-center transition-colors',
            currentWord
              ? 'border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))]'
              : 'border-[var(--border)] bg-[var(--surface-inset-bg)]',
          ].join(' ')}
        >
          {currentWord ? (
            <p className="text-2xl sm:text-3xl font-black tracking-[0.28em] uppercase gradient-title">{currentWord}</p>
          ) : (
            <p className="text-sm text-muted font-medium">Drag through adjacent letters</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={selectedPath.length === 0 || timeUp || disabled}
            className="btn-secondary !w-auto shrink-0 h-12 px-5 !py-0 text-sm font-bold disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="btn-primary flex-1 !w-auto h-12 !py-0 text-sm font-black"
          >
            {submitting ? 'Checking…' : timeUp ? "Time's up" : 'Submit word'}
          </button>
        </div>

        <div className="pb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="label-caps text-[10px]">Words found</p>
            <p className="text-[10px] text-faint tabular-nums">{foundWords.length}</p>
          </div>
          {foundWords.length > 0 ? (
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[var(--card-strong)] to-transparent z-[1]" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--card-strong)] to-transparent z-[1]" />
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {foundWords.map((w) => (
                  <span
                    key={w}
                    className="shrink-0 px-3 py-1 rounded-full text-xs font-bold bg-[var(--chip-active-bg)] text-[var(--chip-active-text)] border border-[var(--chip-active-border)]"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-[11px] text-faint">3 letters = 100 · 4 = 400 · 5 = 800 pts</p>
          )}
        </div>
      </div>
    </div>
  )
}
