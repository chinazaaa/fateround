import Link from 'next/link'
import { FateRoundLogo } from '@/components/FateRoundLogo'

/**
 * Fixed top-left FateRound wordmark that links home — the same header used on the
 * home, games, and rooms pages. Render once per route (via a layout) so it appears
 * across all of a page's states (loading, error, content).
 */
export function SiteLogoHeader() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 pointer-events-none border-b border-[var(--border)]/50 bg-[color-mix(in_srgb,var(--background)_90%,transparent)] backdrop-blur-md">
      <Link href="/" className="pointer-events-auto" aria-label="FateRound home">
        <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
      </Link>
    </header>
  )
}
