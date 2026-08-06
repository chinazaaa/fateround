import Link from 'next/link'
import type { ReactNode } from 'react'
import { SITE_NAME } from '@/lib/seo'
import { getMarketingPage } from '@/lib/marketing-landing'

type FooterLink = { href: string; label: string }

type SocialLink = { href: string; label: string; icon: ReactNode }

const SOCIAL_LINKS: SocialLink[] = [
  {
    href: 'https://www.tiktok.com/@fateround',
    label: 'FateRound on TikTok',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width={18} height={18}>
        <path d="M16.6 5.82a4.28 4.28 0 0 1-1.05-2.82h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.27 0 .53.04.78.12v-3.2a5.8 5.8 0 0 0-.78-.05 5.7 5.7 0 1 0 5.7 5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.28a4.28 4.28 0 0 1-3.25-1.46Z" />
      </svg>
    ),
  },
  {
    href: 'https://x.com/Fateround',
    label: 'FateRound on X',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width={18} height={18}>
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
  { href: '/daily-challenges', label: 'Daily Challenges' },
  { href: '/blog', label: 'Blog' },
  { href: '/faq', label: 'FAQ & help' },
  { href: '/contact', label: 'Contact us' },
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
  'online-tournaments',
  'nigerian-games',
  'school-whot-championship',
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
    <nav className="foot-col" aria-label={title}>
      <h2 className="foot-col-h">{title}</h2>
      <ul>
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Public-page footer with a nominative-use trademark disclaimer.
 * Rendered on the marketing/landing pages (home, /games, /games/[slug]) —
 * not inside live game rooms. Uses the FateRound design-system chrome.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="foot-inner">
        <div className="foot-grid">
          <div className="foot-brand">
            <p className="foot-name">{SITE_NAME}</p>
            <p className="foot-tag">
              Free party and board games for your squad. Share the room link and play from any device.
            </p>
            <div className="foot-social">
              {SOCIAL_LINKS.map((social) => (
                <a
                  key={social.href}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={social.label}
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>
          <FooterColumn title="FateRound" links={PRIMARY_LINKS} />
          <FooterColumn title="Ways to play" links={marketingLinks(WAYS_TO_PLAY_SLUGS)} />
          <FooterColumn title="Free alternatives" links={marketingLinks(ALTERNATIVE_SLUGS)} />
        </div>

        <p className="foot-legal">
          <Link href="/privacy">Privacy Policy</Link>
          {' · '}
          <Link href="/terms">Terms of Service</Link>
        </p>

        <p className="foot-legal">
          {SITE_NAME} is an independent platform and is not affiliated with, endorsed by, or sponsored by the owners of
          Yahtzee®, Monopoly®, Scrabble®, UNO®, Whot®, Codenames®, Quiplash® or any other game. All trademarks are the
          property of their respective owners and are used here only to describe the game being played.
        </p>
      </div>
    </footer>
  )
}
