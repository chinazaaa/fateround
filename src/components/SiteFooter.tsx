import Link from 'next/link'
import { SITE_NAME } from '@/lib/seo'
import { getMarketingPage } from '@/lib/marketing-landing'

type FooterLink = { href: string; label: string }

const PRIMARY_LINKS: FooterLink[] = [
  { href: '/', label: 'Home' },
  { href: '/games', label: 'All games' },
  { href: '/create', label: 'Create a game' },
]

/** Curated order for the two marketing columns. Unlisted marketing pages simply don't appear here. */
const WAYS_TO_PLAY_SLUGS = [
  'free-online-party-games',
  'games-to-play-when-bored',
  'discord-games',
  'video-call-games',
  'virtual-game-night',
  'virtual-team-games',
  'long-distance-games',
]

const ALTERNATIVE_SLUGS = ['free-jackbox-alternative', 'free-kahoot-alternative', 'houseparty-alternative']

function marketingLinks(slugs: string[]): FooterLink[] {
  return slugs.flatMap((slug) => {
    const page = getMarketingPage(slug)
    return page ? [{ href: `/${page.slug}`, label: page.breadcrumbName }] : []
  })
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav className="space-y-2.5">
      <h2 className="label-caps">{title}</h2>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-faint text-sm hover:text-body transition-colors">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Public-page footer with a nominative-use trademark disclaimer.
 * Rendered on the marketing/landing pages (home, /games, /games/[slug]) —
 * not inside live game rooms.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-theme px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 space-y-2 sm:col-span-1">
            <p className="font-black text-body">{SITE_NAME}</p>
            <p className="text-faint text-xs leading-relaxed">
              Free online party games — one link, everyone plays from their phone. No sign-up, no download.
            </p>
          </div>
          <FooterColumn title="Fate Round" links={PRIMARY_LINKS} />
          <FooterColumn title="Ways to play" links={marketingLinks(WAYS_TO_PLAY_SLUGS)} />
          <FooterColumn title="Free alternatives" links={marketingLinks(ALTERNATIVE_SLUGS)} />
        </div>

        <p className="mt-10 border-t border-theme pt-6 text-faint text-[11px] leading-relaxed">
          {SITE_NAME} is an independent platform and is not affiliated with, endorsed by, or sponsored by the owners of
          Yahtzee®, Monopoly®, Scrabble® or any other game. All trademarks are the property of their respective owners
          and are used here only to describe the game being played.
        </p>
      </div>
    </footer>
  )
}
