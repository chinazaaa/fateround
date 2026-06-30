import type { CSSProperties } from 'react'
import type { ChessPieceType } from '@/lib/chess-appearance'

/**
 * Tintable SVG chess pieces. Each piece is a single closed silhouette on a
 * 45×45 grid (symmetric about x=22.5). They're drawn with `currentColor`, so
 * the existing per-set `color` + `filter` theming applies unchanged — a crisp,
 * cross-platform replacement for the old Unicode glyphs (which rendered thin
 * and, on iOS, as emoji).
 *
 * `variant: 'filled'` fills the silhouette; `variant: 'outline'` draws just its
 * outline (a hollow line-drawing) — that's what the Outline / Ink sets use.
 */

// A shared two-tier base every piece sits on.
const BASE = 'M9.5 40.5 H35.5 V38 H33 V35.5 H12 V38 H9.5 Z'

// Pieces whose paths self-overlap (a slit cut into a solid body) need even-odd
// fill so the overlap punches a hole instead of filling it.
const EVEN_ODD: Partial<Record<ChessPieceType, true>> = { b: true }

const PIECE_PATHS: Record<ChessPieceType, string> = {
  // Pawn — head, flared body, base.
  p:
    'M22.5 9c-2.8 0-5.1 2.3-5.1 5.1 0 1.8.9 3.4 2.3 4.3-2.9 1.5-4.9 4.6-4.9 8.2L13.5 35.5h18l-1.3-8.9c0-3.6-2-6.7-4.9-8.2 1.4-.9 2.3-2.5 2.3-4.3 0-2.8-2.3-5.1-5.1-5.1Z ' +
    BASE,
  // Rook — battlemented top, straight body, base.
  r: 'M13.5 35.5h18L30.3 21.5H32V14h-4v3h-3.5v-3h-4v3H17v-3h-4v7.5h1.7Z ' + BASE,
  // Bishop — top ball, mitre with a diagonal slit, collar, base.
  b:
    'M22.5 11.5c2.7 0 4.7 2.7 4.7 5.8 0 2.3-1.2 4.4-3 6.1 2.4 1.2 4.3 3.9 4.5 6.6H16.3c.2-2.7 2.1-5.4 4.5-6.6-1.8-1.7-3-3.8-3-6.1 0-3.1 2-5.8 4.7-5.8Z ' +
    'M22.5 4.9a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6Z ' +
    'M20.6 15.3l3 3-.8.9-3-3 .8-.9Z ' +
    'M17 30h11l1.5 5.5h-14Z ' +
    BASE,
  // Knight — horse-head profile facing left.
  n:
    'M26 9c2.5 1.5 4.5 4 5 7 .5 3.5 0 6.5-.5 10v4H17.5c0-2.5.5-4.5 2-6-2 1-4.5 1-6-0.5-1-1-.7-2.2.5-3-1.5.5-2.5 0-2.5-1 0-1.5 2-2.2 4-2-0.7-1.2-.5-2.5.8-3.2l2.7-.3c.5-2 1-3.5 3-4.2 1.3-.5 2.7-.8 4-.8Z ' +
    'M19.6 16.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z ' +
    BASE,
  // Queen — five-point crown topped with balls, collar, base.
  q:
    'M10 30h25V17l-3.2 4-3.1-5-2.8 5-3.4-5.8-3.4 5.8-2.8-5-3.1 5L10 17Z ' +
    'M10 14.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z ' +
    'M16.3 13.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z ' +
    'M22.5 12.8a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z ' +
    'M28.7 13.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z ' +
    'M35 14.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z ' +
    'M13 30h19l-1.5 5.5h-16Z ' +
    BASE,
  // King — cross finial, bell-shaped crown, collar, base.
  k:
    'M20.8 6h3.4v3.2h3.2v3.4h-3.2V17h-3.4v-4.4h-3.2V9.2h3.2Z ' +
    'M14 30c-1-6 .5-12 8.5-13.5C30.5 18 32 24 31 30Z ' +
    'M14.5 30h16L29 35.5H16Z ' +
    BASE,
}

export function ChessPieceIcon({
  type,
  variant,
  className,
  style,
}: {
  type: ChessPieceType
  variant: 'filled' | 'outline'
  className?: string
  style?: CSSProperties
}) {
  const filled = variant === 'filled'
  return (
    <svg
      viewBox="0 0 45 45"
      className={className}
      style={style}
      role="img"
      aria-hidden
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0.8 : 1.8}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d={PIECE_PATHS[type]} fillRule={EVEN_ODD[type] ? 'evenodd' : 'nonzero'} />
    </svg>
  )
}
