'use client'

import { wordFromPath, wordHuntPoints, WORD_HUNT_MIN_WORD_LENGTH } from '@/lib/word-hunt'
import { WordHuntGrid } from '@/components/word-hunt/WordHuntGrid'

type Props = {
  grid: string[][]
  selectedPath: number[]
  onPathChange: (path: number[]) => void
  onStrokeEnd: (path: number[]) => void
  foundWords: string[]
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
  myPoints,
  timeLabel,
  timeUp,
  secondsLeft,
  disabled = false,
}: Props) {
  const currentWord = wordFromPath(grid, selectedPath)
  const currentPoints =
    currentWord.length >= WORD_HUNT_MIN_WORD_LENGTH ? wordHuntPoints(currentWord.length) : 0
  const timerUrgent = !timeUp && secondsLeft <= 10

  return (
    <div className="glass-card-strong overflow-hidden border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] shadow-[var(--card-shadow-glow)]">
      <div className="grid grid-cols-[1fr_auto] gap-3 p-4 border-b border-[var(--border)]">
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] px-3 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted">Words</p>
          <p className="text-xl font-black tabular-nums text-[var(--foreground)] leading-tight">
            {foundWords.length}
          </p>
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

      <div className="px-4 pt-3 pb-1 min-h-[2.5rem] flex items-center justify-center">
        {currentWord ? (
          <div className="px-4 py-1.5 rounded-full bg-[color-mix(in_srgb,var(--primary)_78%,#22c55e)] text-white font-black text-sm sm:text-base tracking-[0.12em] uppercase shadow-[0_4px_14px_-4px_color-mix(in_srgb,var(--primary)_55%,#16a34a)]">
            {currentWord}
            {currentPoints > 0 && <span className="opacity-90"> (+{currentPoints})</span>}
          </div>
        ) : (
          <p className="text-sm text-muted font-medium">Drag through adjacent letters</p>
        )}
      </div>

      <div className="px-4 pt-2 pb-3">
        <WordHuntGrid
          grid={grid}
          selectedPath={selectedPath}
          onPathChange={onPathChange}
          onStrokeEnd={onStrokeEnd}
          disabled={disabled}
          variant="play"
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
