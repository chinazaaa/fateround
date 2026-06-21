'use client'

import { GameTypeBadge } from '@/components/GameTypeBadge'
import type { GameType } from '@/types'

type Props = {
  emoji?: string
  title?: string | null
  gameType?: GameType | string
  meta?: React.ReactNode
  subtitle?: string
  badge?: React.ReactNode
  align?: 'center' | 'left'
}

export function GameJoinHeader({
  emoji,
  title,
  gameType,
  meta,
  subtitle,
  badge,
  align = 'center',
}: Props) {
  const alignClass = align === 'center' ? 'text-center' : 'text-left'

  return (
    <div className={`space-y-2 ${alignClass}`}>
      {emoji ? <div className="text-4xl sm:text-5xl leading-none">{emoji}</div> : null}
      {title ? (
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title">{title}</h1>
      ) : null}
      {gameType ? <GameTypeBadge gameType={gameType} /> : badge}
      {meta ? <div className="text-muted text-sm leading-relaxed">{meta}</div> : null}
      {subtitle ? <p className="text-muted text-sm leading-relaxed">{subtitle}</p> : null}
    </div>
  )
}
