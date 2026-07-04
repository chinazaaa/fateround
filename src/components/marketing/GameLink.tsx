import Link from 'next/link'
import type { ReactNode } from 'react'
import type { GameType } from '@/types'
import { gameTypeConfig } from '@/lib/game-types'
import { gameLandingSlug } from '@/lib/game-landing'

const INLINE_LINK_CLASS =
  'font-medium text-body underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity'

/** Inline link to a game's `/games/[slug]` landing page. Defaults its text to the game's label. */
export function GameLink({ type, children }: { type: GameType; children?: ReactNode }) {
  const slug = gameLandingSlug(type)
  const label = children ?? gameTypeConfig(type).label
  return (
    <Link href={`/games/${slug}`} className={INLINE_LINK_CLASS}>
      {label}
    </Link>
  )
}

/** Inline link to a hub route (defaults to the `/games` catalog) — for phrases like "20+ games". */
export function HubLink({ href = '/games', children }: { href?: string; children: ReactNode }) {
  return (
    <Link href={href} className={INLINE_LINK_CLASS}>
      {children}
    </Link>
  )
}
