'use client'

import { GameTypeBadge } from '@/components/GameTypeBadge'
import { ContentLabelChip } from '@/components/game-lobby/ContentLabelChip'
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

  return (
    <div className={`space-y-2 ${alignClass}`}>
      {emoji ? <div className="text-4xl sm:text-5xl leading-none">{emoji}</div> : null}
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
