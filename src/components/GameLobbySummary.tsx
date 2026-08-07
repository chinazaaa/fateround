import { gameLobbySummaryChips, customGameDisplayTitle } from '@/lib/game-lobby-summary'
import { Glyph } from '@/components/icons/Glyph'
import { UsersIcon } from '@/components/host/host-icons'
import type { Game } from '@/types'

export function GameLobbySummary({ game, className = '' }: { game: Game; className?: string }) {
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
              className="inline-flex items-center gap-1.5 rounded-full border border-theme bg-[var(--surface-inset)] px-2.5 py-1 text-xs font-medium text-body"
            >
              {chip.key === 'room-capacity' ? (
                <UsersIcon size={11} className="shrink-0 text-[var(--primary)]" />
              ) : chip.emoji ? (
                <span aria-hidden className="text-[0.85em] leading-none shrink-0">
                  {chip.emoji}
                </span>
              ) : null}
              <span>{chip.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
