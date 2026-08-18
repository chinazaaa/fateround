'use client'
import type { GameType } from '@/types'
import { gameTypeConfig } from '@/lib/game-types'
import { gameIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'
import { isMatureGame, MATURE_BADGE_LABEL } from '@/lib/game-maturity'

function MatureBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}
      style={{
        background: 'color-mix(in srgb, var(--danger, #dc2626) 14%, transparent)',
        color: 'var(--danger, #dc2626)',
      }}
    >
      {MATURE_BADGE_LABEL}
    </span>
  )
}

interface GameTypeCardProps {
  type: GameType
  selected?: boolean
  compact?: boolean
  onClick: () => void
}

export function GameTypeCard({ type, selected, compact, onClick }: GameTypeCardProps) {
  const cfg = gameTypeConfig(type)
  const { card } = cfg

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`game-type-card w-full p-4 ${selected ? 'game-type-card-selected' : ''}`}
        style={{ '--accent': card.accent } as React.CSSProperties}
      >
        <div className="game-type-card-glow" />
        <div className="relative flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: card.accentSoft, color: card.accent }}
          >
            <Glyph icon={gameIcon(type)} size={22} />
          </span>
          <div className="min-w-0 flex-1 text-left">
            <p className="flex items-center gap-1.5 font-semibold">
              <span className="truncate">{cfg.label}</span>
              {isMatureGame(type) && <MatureBadge />}
            </p>
            <p className="text-faint text-xs truncate">{cfg.tagline}</p>
          </div>
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`game-type-card w-full ${selected ? 'game-type-card-selected' : ''}`}
      style={{ '--accent': card.accent } as React.CSSProperties}
    >
      <div className="game-type-card-glow" />
      <div className="relative p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: card.accentSoft, color: card.accent }}
          >
            <Glyph icon={gameIcon(type)} size={30} />
          </span>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {isMatureGame(type) && <MatureBadge />}
            {card.featured && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: card.accentSoft, color: card.accent }}
              >
                Popular
              </span>
            )}
          </div>
        </div>
        <div>
          <h3 className="font-bold text-lg tracking-tight">{cfg.label}</h3>
          <p className="text-muted text-sm mt-1 leading-relaxed">{cfg.tagline}</p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-medium"
            style={{ background: card.accentSoft, color: card.accent }}
          >
            {card.players}
          </span>
          <span className="text-faint text-[11px]">{card.vibe}</span>
        </div>
      </div>
    </button>
  )
}
