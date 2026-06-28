import type { CrazyEightsCard, CrazyEightsSuit } from '@/types'
import { CRAZY8_SUIT_SYMBOLS, isWildCard } from '@/lib/crazy-eights'

/** Suit accent colors — hearts/diamonds red, spades/clubs near-black, joker violet. */
export const CRAZY8_SUIT_COLORS: Record<CrazyEightsSuit, string> = {
  spades: '#111827',
  clubs: '#111827',
  hearts: '#dc2626',
  diamonds: '#dc2626',
  joker: '#7c3aed',
}

const RANK_LABELS: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }

function rankLabel(card: CrazyEightsCard): string {
  if (card.suit === 'joker') return 'JOKER'
  return RANK_LABELS[card.rank] ?? String(card.rank)
}

const SIZE_PX = { sm: 16, md: 20, lg: 24 } as const

const FONT_SIZE = { sm: 'text-[10px]', md: 'text-xs', lg: 'text-sm' } as const

/**
 * Renders a card's suit symbol plus its rank label. Drive everything off the card.
 * Pips use real suit colors (hearts/diamonds red, spades/clubs near-black) on the light
 * card faces; only the violet wild faces — the 8 and Jokers — get white pips for contrast.
 */
export function CrazyEightsSuitIcon({
  card,
  size = 'md',
  variant = 'default',
  className = '',
}: {
  card: CrazyEightsCard
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'on-card'
  className?: string
}) {
  const px = SIZE_PX[size]
  // Wild cards (8 + Jokers) get the violet face in CrazyEightsBoard — reuse the shared
  // helper so face and pip colors stay in sync if the wild-card rule ever changes.
  const onVioletFace = isWildCard(card)
  const color = variant === 'on-card' && onVioletFace ? '#ffffff' : CRAZY8_SUIT_COLORS[card.suit]

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 leading-none ${className}`}
      style={{ color, fontSize: px }}
      aria-hidden
    >
      <span className="leading-none">{CRAZY8_SUIT_SYMBOLS[card.suit]}</span>
      <span className={`font-black leading-none ${FONT_SIZE[size]}`}>{rankLabel(card)}</span>
    </span>
  )
}
