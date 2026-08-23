'use client'

import { findNameColor } from '@/lib/coins/shop-catalog'

/**
 * Player name treatment (`docs/coins-and-shop-plan.md` §"Where cosmetics
 * render" → "Name colors"). Reads the equipped_name_color slug and
 * applies a curated color / gradient — no free picker.
 *
 * Every callsite that renders a player's name should route through this
 * component so a purchased name color follows the player everywhere they
 * appear (lobbies, scoreboards, chat, results, share cards).
 *
 * Fallback: no slug (or a retired slug) renders the plain text in the
 * ambient token color, which is what every existing surface does today.
 *
 * Curated palette + AA-tuned per mode via CSS custom properties — see the
 * `light` / `dark` fields in `src/lib/coins/shop-catalog.ts`.
 */
export function PlayerName({
  name,
  colorSlug,
  className = '',
}: {
  name: string
  colorSlug?: string | null
  className?: string
}) {
  const spec = findNameColor(colorSlug)
  if (!spec) return <span className={className}>{name}</span>

  if (spec.gradient) {
    // A CSS-var flip toggles the gradient between light / dark modes so the
    // component is theme-aware without prop drilling. The @media selector
    // lives in globals.css alongside the other theme-aware tokens.
    const style: React.CSSProperties = {
      backgroundImage: `var(--pname-gradient, ${spec.gradient.light})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      // Custom properties are typed as unknown in React.CSSProperties.
      ['--pname-gradient-light' as never]: spec.gradient.light,
      ['--pname-gradient-dark' as never]: spec.gradient.dark,
    }
    return (
      <span className={`fr-name-gradient ${className}`} style={style}>
        {name}
      </span>
    )
  }

  const style: React.CSSProperties = {
    color: `var(--pname-solid, ${spec.light})`,
    ['--pname-solid-light' as never]: spec.light,
    ['--pname-solid-dark' as never]: spec.dark,
  }
  return (
    <span className={`fr-name-solid ${className}`} style={style}>
      {name}
    </span>
  )
}
