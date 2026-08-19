import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { gameIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'
import type { GameType } from '@/types'

export function GameTypeBadge({ gameType, className = '' }: { gameType?: GameType | string; className?: string }) {
  const type = parseGameType(gameType)
  const cfg = gameTypeConfig(type)
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
      <Glyph icon={gameIcon(type)} size={11} className="shrink-0" />
      <span>{cfg.label}</span>
    </span>
  )
}
