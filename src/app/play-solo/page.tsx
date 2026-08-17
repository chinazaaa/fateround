import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'

/**
 * Solo-play hub — a single index over every /play-solo/<game> surface.
 *
 * Linked from the "Play other solo games" button on each game's finish panel
 * and crawlable via the sitemap so search engines can discover every solo
 * surface from one page.
 */

export const metadata: Metadata = {
  title: 'Play Solo vs Bot — Free Practice Games on FateRound',
  description:
    'Practice Whot, UNO, Crazy Eights, Ludo, Ayo, and Five Dice against a computer opponent. Free, no sign-up, works on any device.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Play Solo vs Bot — Free Practice Games on FateRound',
    description: 'Every FateRound game, playable solo against a bot — no room, no account.',
    url: '/play-solo',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Play Solo vs Bot — Free Practice Games on FateRound',
    description: 'Every FateRound game, playable solo — no sign-up.',
  },
}

type SoloGame = { href: string; title: string; blurb: string; og: string }

// Ordered by expected engagement. Kept in one array so the hub stays in sync
// with the /play-solo/<game> route list — add a new route here when you add
// a new solo surface.
const SOLO_GAMES: SoloGame[] = [
  {
    href: '/play-solo/whot',
    title: 'Whot',
    blurb: 'Classic Nigerian Whot — shape-matching card game with Pick 2/3, hold-on, and WHOT wilds.',
    og: '/og/whot.png',
  },
  {
    href: '/play-solo/uno',
    title: 'Match Up (UNO)',
    blurb: 'The classic color-and-number card game. Wilds, Skips, Draw 2s — first to empty their hand wins.',
    og: '/og/uno.png',
  },
  {
    href: '/play-solo/crazy-eights',
    title: 'Crazy Eights',
    blurb: '52-card deck with wild 8s and optional action cards. Race to shed your hand first.',
    og: '/og/crazy-eights.png',
  },
  {
    href: '/play-solo/ludo',
    title: 'Ludo',
    blurb: 'Bring your pieces out on a 6, chase captures, race four home to win.',
    og: '/og/ludo.png',
  },
  {
    href: '/play-solo/ayo',
    title: 'Ayo (Mancala)',
    blurb: 'Traditional West-African seed-sowing board game. Capture more seeds than the bot.',
    og: '/og/ayo.png',
  },
  {
    href: '/play-solo/yahtzee',
    title: 'Five Dice (Yahtzee)',
    blurb: 'Roll dice, fill your scorecard, aim for the big categories. Solo scoreboard tracks your best.',
    og: '/og/yahtzee.png',
  },
]

export default function PlaySoloHubPage() {
  // ItemList JSON-LD so search engines see this as a curated list of solo
  // game pages (not just a random landing page with six links). Each entry
  // points at its own /play-solo/<game> URL and inherits that page's metadata
  // for the rich card. `position` is 1-indexed per schema.org.
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Solo games vs bot on FateRound',
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: SOLO_GAMES.length,
    itemListElement: SOLO_GAMES.map((g, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: g.href,
      name: g.title,
      description: g.blurb,
    })),
  }

  return (
    <div className="fr-site flex min-h-dvh flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <MarketingHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>
            Play solo vs bot
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            Pick any game and practice against the computer. No room, no sign-up — your progress is saved on this
            device.
          </p>
        </header>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SOLO_GAMES.map((g) => (
            <li key={g.href}>
              <Link
                href={g.href}
                className="block rounded-2xl border p-4 transition hover:opacity-90"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'var(--surface-inset-bg)',
                  color: 'var(--text)',
                }}
              >
                <h2 className="text-base font-bold">{g.title}</h2>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {g.blurb}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <SiteFooter />
    </div>
  )
}
