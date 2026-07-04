import Link from 'next/link'
import type { ReactNode } from 'react'
import { SITE_NAME } from '@/lib/seo'
import { getMarketingPage } from '@/lib/marketing-landing'

type FooterLink = { href: string; label: string }

type SocialLink = { href: string; label: string; icon: ReactNode }

const SOCIAL_LINKS: SocialLink[] = [
  {
    href: 'https://www.tiktok.com/@fateround',
    label: 'Fate Round on TikTok',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-full w-full">
        <path d="M16.6 5.82a4.28 4.28 0 0 1-1.05-2.82h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.27 0 .53.04.78.12v-3.2a5.8 5.8 0 0 0-.78-.05 5.7 5.7 0 1 0 5.7 5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.28a4.28 4.28 0 0 1-3.25-1.46Z" />
      </svg>
    ),
  },
  {
    href: 'https://x.com/Fateround',
    label: 'Fate Round on X',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-full w-full">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
      </svg>
    ),
  },
]

const PRIMARY_LINKS: FooterLink[] = [
  { href: '/games', label: 'All games' },
  { href: '/create', label: 'Create a game' },
  { href: '/tournament', label: 'Tournaments' },
  { href: '/rooms', label: 'Rooms' },
  { href: '/leaderboard', label: 'Leaderboard' },
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
  'nigerian-games',
  'christmas-games-online',
]

const ALTERNATIVE_SLUGS = [
  'free-jackbox-alternative',
  'free-kahoot-alternative',
  'houseparty-alternative',
  'free-ludo-king-alternative',
  'whot-vs-uno',
]

function marketingLinks(slugs: string[]): FooterLink[] {
  return slugs.flatMap((slug) => {
    const page = getMarketingPage(slug)
    return page ? [{ href: `/${page.slug}`, label: page.breadcrumbName }] : []
  })
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav className="space-y-2.5" aria-label={title}>
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
          <div className="col-span-2 space-y-3 sm:col-span-1">
            <p className="font-black text-body">{SITE_NAME}</p>
            <p className="text-faint text-xs leading-relaxed">
              Free online party games — one link, everyone plays from their phone. No sign-up, no download.
            </p>
            <div className="flex items-center gap-2">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.href}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-theme text-faint transition-colors hover:border-theme-strong hover:text-body"
                >
                  <span className="h-[18px] w-[18px]">{social.icon}</span>
                </a>
              ))}
            </div>
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
