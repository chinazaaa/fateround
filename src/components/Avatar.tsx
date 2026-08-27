'use client'

import { getInitial } from '@/lib/utils'
import { findFrame } from '@/lib/coins/shop-catalog'

const sizeMap = {
  sm: { container: 'w-8 h-8 text-sm', px: 32 },
  md: { container: 'w-10 h-10 text-lg', px: 40 },
  lg: { container: 'w-14 h-14 text-xl', px: 56 },
} as const

export interface AvatarProps {
  name: string
  photoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /**
   * Equipped avatar frame slug (`docs/coins-and-shop-plan.md` §"Where
   * cosmetics render"). When set, the avatar is wrapped in a ring +
   * optional glow / decoration per the frame's spec. Unknown or retired
   * slugs fall back to the plain render — retirement never bricks a
   * profile card.
   */
  frameSlug?: string | null
}

export function Avatar({ name, photoUrl, size = 'md', className = '', frameSlug = null }: AvatarProps) {
  const s = sizeMap[size]
  const frame = findFrame(frameSlug)

  const inner = photoUrl ? (
    <img
      src={photoUrl}
      alt={name}
      width={s.px}
      height={s.px}
      className={`${s.container} rounded-full object-cover shrink-0`}
    />
  ) : (
    <div className={`avatar ${s.container} shrink-0`}>{getInitial(name)}</div>
  )

  if (!frame) return <div className={`shrink-0 ${className}`}>{inner}</div>

  const ringStyle: React.CSSProperties = {
    boxShadow: [frame.ring.color ? `0 0 0 2px ${frame.ring.color}` : null, frame.ring.shadow ?? null]
      .filter(Boolean)
      .join(', '),
  }
  const decoClass =
    frame.ring.decoration === 'laurel' ? 'fr-frame-laurel' : frame.ring.decoration === 'stars' ? 'fr-frame-stars' : ''

  return (
    <div className={`relative inline-block rounded-full shrink-0 ${decoClass} ${className}`} style={ringStyle}>
      {inner}
    </div>
  )
}
