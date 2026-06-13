import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import type { GameType } from '@/types'

export function GameTypeBadge({ gameType, className = '' }: { gameType?: GameType | string; className?: string }) {
  const cfg = gameTypeConfig(parseGameType(gameType))
  const { card } = cfg

  return (
    <span
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
      style={{
        background: card.accentSoft,
        borderColor: `${card.accent}40`,
        color: card.accent,
      }}
    >
      <span aria-hidden>{cfg.card.emoji}</span>
      <span>{cfg.label}</span>
    </span>
  )
}
