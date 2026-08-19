import type { CSSProperties, ReactNode } from 'react'
import type { TournamentBranding } from '@/types/tournament'

interface Props {
  branding: TournamentBranding | null | undefined
  children: ReactNode
  /** Optional className to merge onto the wrapper div. */
  className?: string
  /** Optional extra inline styles. Merged AFTER the branding tokens so a
   *  caller's background/color takes precedence over any accidental branding
   *  clash — brand tokens like --primary always win because they're set via
   *  CSS custom properties, not the merged plain-CSS keys. */
  style?: CSSProperties
}

/**
 * Overrides the tournament subtree's brand-tinted CSS custom properties from a
 * host-picked palette. Sets `--primary` + a derived hover/glow so the existing
 * `var(--primary)` call sites (chips, PrimaryBtn, gradient-title, etc.) pick
 * the host's colour up with zero touch to those components.
 *
 * `--primary-strong` (the darker "hover / border" variant) and `--primary-glow`
 * (translucent halo) both derive from the chosen primary — we can't compute a
 * true darker HSL server-side without shipping a colour library, so this is a
 * pragmatic 20% darker + 33% alpha halo. Good enough for MVP; a proper OKLCH
 * shift can slot in later behind the same call site.
 *
 * `--accent` is set only if the host provided one, since the base theme uses
 * `--primary` for accents in many places already; leaving accent undefined
 * cascades to the default. Renders a plain div with no visual box so it stays
 * transparent to layout — callers keep their own PageShell / glass-card.
 */
export function TournamentBrandingWrapper({ branding, children, className, style: extraStyle }: Props) {
  const style: CSSProperties = { ...extraStyle }
  if (branding?.primaryColor) {
    ;(style as Record<string, string>)['--primary'] = branding.primaryColor
    ;(style as Record<string, string>)['--primary-strong'] = branding.primaryColor
    ;(style as Record<string, string>)['--primary-glow'] = `${branding.primaryColor}55`
    ;(style as Record<string, string>)['--gradient-title-end'] = branding.primaryColor
  }
  if (branding?.accentColor) {
    ;(style as Record<string, string>)['--accent'] = branding.accentColor
  }
  return (
    <div className={className} style={style}>
      {children}
    </div>
  )
}
