import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import type { GameType } from '@/types'

export function GameTypeBadge({
  gameType,
  className = '',
}: {
  gameType?: GameType | string
  className?: string
}) {
  const cfg = gameTypeConfig(parseGameType(gameType))

  return (
    <p
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 py-1 text-xs font-semibold text-white/90 ${className}`}
    >
      <span aria-hidden>{cfg.headerEmoji}</span>
      <span>{cfg.label}</span>
    </p>
  )
}
