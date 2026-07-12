'use client'

import { useMemo } from 'react'

/**
 * Compact word strip that sits ABOVE the board so the words stay in view without scrolling
 * past the grid. Words flow into two rows and scroll horizontally when they overflow; each
 * word is struck through once found and sorted to the end of the list. The reveal (paid hint)
 * is a floating lightbulb pinned to the right edge so it never scrolls away.
 */
export function WordList({
  words,
  wordOwners,
  myPlayerId,
  myColor,
  playerColors = {},
  onWordFlash,
  flashedWord,
  onReveal,
  revealDisabled,
  revealTitle,
}: {
  words: string[]
  /** word -> player id of its first finder (absent = not yet found). */
  wordOwners: Map<string, string>
  myPlayerId?: string | null
  myColor: string
  playerColors?: Record<string, string>
  onWordFlash?: (word: string) => void
  flashedWord?: string | null
  onReveal?: () => void
  revealDisabled?: boolean
  revealTitle?: string
}) {
  const foundCount = words.filter((w) => wordOwners.has(w)).length

  // Unfound words first (original order), found words pushed to the end (original order among
  // themselves) — a stable partition so the list only shifts as words get found.
  const ordered = useMemo(() => {
    const todo: string[] = []
    const done: string[] = []
    for (const w of words) (wordOwners.has(w) ? done : todo).push(w)
    return [...todo, ...done]
  }, [words, wordOwners])

  return (
    <div className="glass-card px-2 py-1.5">
      <div className="flex items-center justify-between mb-1 px-0.5">
        <p className="label-caps text-[10px]">Words to find</p>
        <span className="text-[11px] font-semibold text-muted tabular-nums">
          {foundCount}/{words.length}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 overflow-x-auto pr-3 [mask-image:linear-gradient(to_right,#000_88%,transparent)]">
          <div className="grid grid-rows-2 grid-flow-col auto-cols-max gap-x-2 gap-y-0.5">
            {ordered.map((word) => {
              const ownerId = wordOwners.get(word) ?? null
              const found = ownerId != null
              const color = ownerId ? (ownerId === myPlayerId ? myColor : (playerColors[ownerId] ?? '#94a3b8')) : null
              const isFlashed = flashedWord === word
              return (
                <button
                  key={word}
                  type="button"
                  onClick={() => onWordFlash?.(word)}
                  className={[
                    'text-left rounded-md px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide truncate transition-colors',
                    isFlashed
                      ? 'bg-indigo-100/80 dark:bg-indigo-900/40'
                      : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50',
                    found ? 'line-through opacity-70' : 'text-slate-700 dark:text-slate-200',
                  ].join(' ')}
                  style={found && color ? { color } : undefined}
                >
                  {word}
                </button>
              )
            })}
          </div>
        </div>
        {onReveal && (
          <button
            type="button"
            onClick={onReveal}
            disabled={revealDisabled}
            title={revealTitle}
            aria-label={revealTitle ?? 'Reveal a hidden word'}
            className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full text-base bg-amber-100/90 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200 shadow-sm ring-1 ring-amber-300/50 dark:ring-amber-700/50 disabled:opacity-40 transition-colors hover:bg-amber-100"
          >
            💡
          </button>
        )}
      </div>
    </div>
  )
}
