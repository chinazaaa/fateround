import Link from 'next/link'
import { FateRoundLogo } from '@/components/FateRoundLogo'

/**
 * Fixed top-left FateRound wordmark that links home — the same header used on the
 * home, games, and rooms pages. Render once per route (via a layout) so it appears
 * across all of a page's states (loading, error, content).
 */
export function SiteLogoHeader() {
  return (
    <header className="fixed top-0 inset-x-0 z-40 flex items-center px-4 py-3 pointer-events-none">
      <Link href="/" className="pointer-events-auto" aria-label="Fate Round home">
        <FateRoundLogo className="h-8 w-auto max-w-[9.5rem] sm:max-w-[11rem]" />
      </Link>
    </header>
  )
}
