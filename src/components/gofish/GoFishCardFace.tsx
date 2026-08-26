import type { GoFishCard, GoFishRank, GoFishSuit } from '@/types'
import { gofishRankLabel } from '@/lib/gofish'

/**
 * Suit glyphs (unicode). Rendered as text so they colour with `currentColor` — no SVG
 * assets to ship. Red suits are visually distinguished with a red text colour on the card
 * face; black suits use the theme foreground.
 */
export const GOFISH_SUIT_SYMBOLS: Record<GoFishSuit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
}

export function gofishSuitIsRed(suit: GoFishSuit): boolean {
  return suit === 'hearts' || suit === 'diamonds'
}

/**
 * A single face-up playing card. Sizes come from the parent via `className` so a hand
 * can lay them out at whatever scale it needs (fanned in a row, stacked, small in a
 * summary chip).
 */
export function GoFishCardFace({
  card,
  className = '',
  selected = false,
}: {
  card: GoFishCard
  className?: string
  selected?: boolean
}) {
  const rank = gofishRankLabel(card.rank)
  const suit = GOFISH_SUIT_SYMBOLS[card.suit]
  const red = gofishSuitIsRed(card.suit)
  return (
    <div
      className={`relative select-none rounded-lg border bg-white shadow-sm text-slate-900 ${
        selected ? 'border-emerald-500 ring-2 ring-emerald-400/60' : 'border-slate-300'
      } ${className}`}
      style={{ aspectRatio: '5 / 7' }}
      aria-label={`${rank} of ${card.suit}`}
    >
      <div
        className={`absolute inset-0 flex flex-col justify-between p-1.5 font-mono font-bold ${
          red ? 'text-rose-600' : 'text-slate-900'
        }`}
      >
        <div className="text-left leading-none">
          <div className="text-[0.9em]">{rank}</div>
          <div className="text-[0.75em]">{suit}</div>
        </div>
        <div className="text-center text-[1.8em] leading-none">{suit}</div>
        <div className="rotate-180 text-left leading-none">
          <div className="text-[0.9em]">{rank}</div>
          <div className="text-[0.75em]">{suit}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * Face-down card back — for future opponent-hand fans. Currently we render opponents as
 * a count chip in the roster panel; this stays here as a ready-to-use asset when someone
 * wants a physical fan of backs above each opponent name.
 */
export function GoFishCardBack({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative select-none rounded-lg border border-slate-700 bg-gradient-to-br from-sky-800 to-sky-950 shadow-sm ${className}`}
      style={{ aspectRatio: '5 / 7' }}
      aria-hidden
    >
      <div className="absolute inset-1 rounded-md border border-white/20" />
      <div className="absolute inset-0 flex items-center justify-center text-white/60 text-[1.4em]">🐟</div>
    </div>
  )
}

/** Sub-badge that renders "×3" on a stacked rank so a fanned hand can show quantity cheaply. */
export function GoFishCardCountBadge({ count }: { count: number }) {
  if (count <= 1) return null
  return (
    <span className="absolute -bottom-2 -right-2 rounded-full bg-slate-900 text-white text-xs font-bold h-6 min-w-6 px-1.5 flex items-center justify-center shadow-md">
      ×{count}
    </span>
  )
}

export function GoFishRankChip({ rank, count }: { rank: GoFishRank; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-800/70 px-2 py-0.5 font-mono text-xs">
      <span className="font-bold text-slate-100">{gofishRankLabel(rank)}</span>
      {count != null && count > 1 && <span className="text-slate-400">×{count}</span>}
    </span>
  )
}
