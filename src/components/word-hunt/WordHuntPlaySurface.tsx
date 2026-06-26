'use client'

import { useMemo } from 'react'
import { WORD_HUNT_MIN_WORD_LENGTH } from '@/lib/word-hunt'
import { WordHuntGrid } from '@/components/word-hunt/WordHuntGrid'
import { buildWordHuntPrefixSet, previewWordHuntDrag } from '@/lib/word-hunt-client'

type Props = {
  grid: string[][]
  selectedPath: number[]
  onPathChange: (path: number[]) => void
  onStrokeEnd: (path: number[]) => void
  foundWords: string[]
  validWords: ReadonlySet<string>
  myPoints: number
  timeLabel: string
  timeUp: boolean
  secondsLeft: number
  disabled?: boolean
}

export function WordHuntPlaySurface({
  grid,
  selectedPath,
  onPathChange,
  onStrokeEnd,
  foundWords,
  validWords,
  myPoints,
  timeLabel,
  timeUp,
  secondsLeft,
  disabled = false,
}: Props) {
  const validPrefixes = useMemo(() => buildWordHuntPrefixSet(validWords), [validWords])
  const foundSet = useMemo(() => new Set(foundWords.map((w) => w.toLowerCase())), [foundWords])
  const preview = previewWordHuntDrag(grid, selectedPath, validWords, validPrefixes, foundSet)
  const timerUrgent = !timeUp && secondsLeft <= 10

  const wordChipClass =
    preview.isValidWord && !preview.alreadyFound
      ? 'bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-strong)_100%)] text-white shadow-[0_4px_14px_-4px_var(--primary-glow)]'
      : preview.prefixValid && preview.word.length >= WORD_HUNT_MIN_WORD_LENGTH
        ? 'bg-[color-mix(in_srgb,var(--primary)_12%,var(--card-strong))] text-[var(--foreground)] border border-[color-mix(in_srgb,var(--primary)_25%,var(--border))]'
        : preview.word
          ? 'bg-[var(--surface-inset-bg)] text-muted border border-[var(--border-strong)]'
          : ''

  return (
    <div className="glass-card-strong overflow-hidden border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] shadow-[var(--card-shadow-glow)] overscroll-none">
      <div className="grid grid-cols-[1fr_auto] gap-3 p-4 border-b border-[var(--border)]">
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] px-3 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted">Words</p>
          <p className="text-xl font-black tabular-nums text-[var(--foreground)] leading-tight">{foundWords.length}</p>
          <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-muted">Score</p>
          <p className="text-xl font-black tabular-nums text-[var(--foreground)] leading-tight">{myPoints}</p>
        </div>
        <div
          className={[
            'rounded-2xl border px-3 py-2.5 text-right self-start min-w-[5.5rem]',
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

      <div className="px-4 h-[3.25rem] flex items-center justify-center gap-2 shrink-0">
        {preview.word ? (
          <>
            <div
              className={[
                'px-4 py-1.5 rounded-full font-black text-sm sm:text-base tracking-[0.12em] uppercase',
                wordChipClass,
              ].join(' ')}
            >
              {preview.word}
              {preview.points != null && <span className="opacity-90"> (+{preview.points})</span>}
              {preview.alreadyFound && preview.word.length >= WORD_HUNT_MIN_WORD_LENGTH && (
                <span className="opacity-75 normal-case tracking-normal text-xs font-semibold"> · keep going?</span>
              )}
            </div>
            {preview.isValidWord && !preview.alreadyFound && (
              <button
                type="button"
                onClick={() => onStrokeEnd(selectedPath)}
                className="shrink-0 px-3 py-1.5 rounded-full bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-strong)_100%)] text-white text-xs font-black uppercase tracking-wide shadow-[0_2px_10px_-4px_var(--primary-glow)] active:scale-95 transition-transform"
              >
                Submit
              </button>
            )}
            <button
              type="button"
              onClick={() => onPathChange([])}
              className="shrink-0 h-8 w-8 rounded-full border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] text-muted font-bold text-sm hover:text-[var(--foreground)] hover:border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] active:scale-95 transition-colors"
              aria-label="Clear letters"
            >
              ×
            </button>
          </>
        ) : (
          <p className="text-sm text-muted font-medium text-center">Drag or tap adjacent letters</p>
        )}
      </div>

      <div className="px-4 pt-2 pb-3 overscroll-none">
        <WordHuntGrid
          grid={grid}
          selectedPath={selectedPath}
          onPathChange={onPathChange}
          onStrokeEnd={onStrokeEnd}
          disabled={disabled}
          variant="play"
          validPrefixes={validPrefixes}
        />
      </div>

      <div className="px-4 pb-4">
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
  )
}
