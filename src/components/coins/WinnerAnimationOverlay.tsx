'use client'

import { findAnimation } from '@/lib/coins/shop-catalog'

/**
 * One-shot celebratory overlay behind the winner hero. Renders a CSS
 * animation keyed on the equipped animation slug — Lottie assets ship
 * later per `docs/coins-art-briefs.md` § "Winner animations" and land
 * without touching this component (the animation class name is the
 * contract).
 *
 * `pointer-events-none` because the coin panel below the hero must stay
 * clickable while the animation is playing.
 */
export function WinnerAnimationOverlay({ slug }: { slug: string }) {
  const anim = findAnimation(slug)
  if (!anim) return null
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl ${anim.cssClass}`}
    />
  )
}
