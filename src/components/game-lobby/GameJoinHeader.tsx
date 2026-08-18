import { GameTypeBadge } from '@/components/GameTypeBadge'
import { ContentLabelChip } from '@/components/game-lobby/ContentLabelChip'
import { gameIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'
import { parseGameType } from '@/lib/game-types'
import type { GameType } from '@/types'

type Props = {
  emoji?: string
  title?: string | null
  gameType?: GameType | string
  /** Host-set content label ("Maths", "Bible trivia") — shown so players know what they're joining. */
  contentLabel?: string | null
  meta?: React.ReactNode
  subtitle?: string
  badge?: React.ReactNode
  align?: 'center' | 'left'
}

export function GameJoinHeader({
  emoji,
  title,
  gameType,
  contentLabel,
  meta,
  subtitle,
  badge,
  align = 'center',
}: Props) {
  const alignClass = align === 'center' ? 'text-center' : 'text-left'
  const chipJustify = align === 'center' ? 'justify-center' : ''
  const parsedType = gameType ? parseGameType(gameType) : null

  return (
    <div className={`space-y-2 ${alignClass}`}>
      {parsedType ? (
        <div className={`flex text-[var(--primary)] pb-1 ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
            <Glyph icon={gameIcon(parsedType)} size={24} />
          </span>
        </div>
      ) : emoji ? (
        <div className={`flex pb-1 ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-2xl leading-none">
            {emoji}
          </span>
        </div>
      ) : null}
      {title ? <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title">{title}</h1> : null}
      <div className={`flex flex-wrap items-center gap-1.5 ${chipJustify}`}>
        {gameType ? <GameTypeBadge gameType={gameType} /> : badge}
        <ContentLabelChip label={contentLabel} />
      </div>
      {meta ? <div className="text-muted text-sm leading-relaxed">{meta}</div> : null}
      {subtitle ? <p className="text-muted text-sm leading-relaxed">{subtitle}</p> : null}
    </div>
  )
}
