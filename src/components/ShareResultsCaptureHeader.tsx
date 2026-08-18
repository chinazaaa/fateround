import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import { gameIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'
import type { Game } from '@/types'

export function ShareResultsCaptureHeader({
  game,
  className = '',
}: {
  game: Pick<Game, 'title' | 'game_type'>
  className?: string
}) {
  const gameType = parseGameType(game.game_type)
  const cfg = gameTypeConfig(gameType)

  return (
    <div
      className={`text-center space-y-1 pb-3 border-b border-[color-mix(in_srgb,var(--primary)_10%,var(--border))] ${className}`}
    >
      <div className="flex justify-center text-[var(--primary)] pb-1">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
          <Glyph icon={gameIcon(gameType)} size={24} />
        </span>
      </div>
      <p className="text-lg sm:text-xl font-black gradient-title leading-tight">{game.title}</p>
      <p className="text-muted text-[10px] sm:text-xs uppercase tracking-wider">{cfg.label}</p>
    </div>
  )
}
