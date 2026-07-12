'use client'

/**
 * The word list beside the grid. Each listed word is struck through and colour-matched to
 * its first finder once found. Clicking a word can flash it in the list, but never reveals
 * where it sits on the board (that is the paid hint).
 */
export function WordList({
  words,
  wordOwners,
  myPlayerId,
  myColor,
  playerColors = {},
  onWordFlash,
  flashedWord,
}: {
  words: string[]
  /** word -> player id of its first finder (absent = not yet found). */
  wordOwners: Map<string, string>
  myPlayerId?: string | null
  myColor: string
  playerColors?: Record<string, string>
  onWordFlash?: (word: string) => void
  flashedWord?: string | null
}) {
  const foundCount = words.filter((w) => wordOwners.has(w)).length

  return (
    <div className="glass-card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="label-caps text-[10px]">Words to find</p>
        <span className="text-[11px] font-semibold text-muted tabular-nums">
          {foundCount}/{words.length}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {words.map((word) => {
          const ownerId = wordOwners.get(word) ?? null
          const found = ownerId != null
          const color = ownerId ? (ownerId === myPlayerId ? myColor : (playerColors[ownerId] ?? '#94a3b8')) : null
          const isFlashed = flashedWord === word
          return (
            <li key={word}>
              <button
                type="button"
                onClick={() => onWordFlash?.(word)}
                className={[
                  'w-full text-left flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-colors',
                  isFlashed
                    ? 'bg-indigo-100/80 dark:bg-indigo-900/40'
                    : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50',
                  found ? 'line-through opacity-70' : 'text-slate-700 dark:text-slate-200',
                ].join(' ')}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm shrink-0 border border-slate-300/60 dark:border-slate-600/60"
                  style={color ? { backgroundColor: color, borderColor: color } : undefined}
                />
                <span
                  className="min-w-0 truncate font-semibold uppercase tracking-wide"
                  style={color ? { color } : undefined}
                >
                  {word}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
