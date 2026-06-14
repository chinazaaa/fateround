import { gameLobbySummaryChips, customGameDisplayTitle } from '@/lib/game-lobby-summary'
import type { Game } from '@/types'

export function GameLobbySummary({
  game,
  className = '',
}: {
  game: Game
  className?: string
}) {
  const chips = gameLobbySummaryChips(game)
  const customTitle = customGameDisplayTitle(game)

  if (chips.length === 0 && !customTitle) return null

  return (
    <div className={`space-y-2 ${className}`}>
      {customTitle && <p className="text-body text-sm font-semibold">{customTitle}</p>}
      {chips.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-full border border-theme bg-[var(--surface-inset)] px-2.5 py-1 text-xs font-medium text-body"
            >
              {chip.emoji ? <span aria-hidden>{chip.emoji}</span> : null}
              <span>{chip.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
