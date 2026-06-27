import Link from 'next/link'
import { SITE_NAME } from '@/lib/seo'

/**
 * Public-page footer with a nominative-use trademark disclaimer.
 * Rendered on the marketing/landing pages (home, /games, /games/[slug]) —
 * not inside live game rooms.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-theme px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-faint text-xs font-medium">
          <Link href="/" className="hover:text-body transition-colors">
            Home
          </Link>
          <Link href="/games" className="hover:text-body transition-colors">
            All games
          </Link>
          <Link href="/create" className="hover:text-body transition-colors">
            Create a game
          </Link>
        </nav>
        <p className="text-faint text-[11px] leading-relaxed">
          {SITE_NAME} is an independent platform and is not affiliated with, endorsed by, or sponsored by the owners of
          Yahtzee®, Monopoly®, Scrabble® or any other game. All trademarks are the property of their respective owners
          and are used here only to describe the game being played.
        </p>
      </div>
    </footer>
  )
}
