import Link from 'next/link'
import { gameRulesHref } from '@/lib/game-landing'
import { parseGameType } from '@/lib/game-types'
import type { GameType } from '@/types'

type Props = {
  gameType: GameType | string | null | undefined
  className?: string
  variant?: 'inline' | 'subtle' | 'header'
}

export function GameRulesLink({ gameType, className = '', variant = 'inline' }: Props) {
  if (!gameType) return null

  const type = parseGameType(gameType)
  const href = gameRulesHref(type)

  const variantClass =
    variant === 'header'
      ? 'text-[11px] sm:text-xs font-medium text-faint hover:text-body transition-colors whitespace-nowrap'
      : variant === 'subtle'
        ? 'text-faint text-xs hover:text-body transition-colors'
        : 'text-xs font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity'

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${variantClass} ${className}`.trim()}
    >
      View game rules
    </Link>
  )
}
