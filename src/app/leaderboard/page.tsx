import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'
import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import { UI_ICONS } from '@/lib/game-glyphs'

export const metadata: Metadata = {
  title: 'Leaderboards',
  description: "See who's on top — daily challenge scores, trophy rankings, and community game winners.",
  alternates: { canonical: '/leaderboard' },
  openGraph: {
    title: `Leaderboards | ${SITE_NAME}`,
    description: "See who's on top — daily challenge scores, trophy rankings, and community game winners.",
    url: '/leaderboard',
    images: [OG_IMAGE],
  },
}

const BOARDS = [
  {
    href: '/leaderboard/daily',
    emoji: '📅',
    title: 'Daily Challenges',
    description: "Today's top scores on each daily puzzle. New puzzles every day.",
    accent: '#6366f1',
  },
  {
    href: '/leaderboard/trophies',
    emoji: '🏆',
    title: 'Trophies',
    description: 'All-time rankings by trophy points earned across every game.',
    accent: '#d4a017',
  },
  {
    href: '/leaderboard/community',
    emoji: '👥',
    title: 'Community',
    description: 'Nightly winners from the WhatsApp community games.',
    accent: '#25D366',
  },
]

export default function LeaderboardHubPage() {
  return (
    <SiteChrome>
      <div className="fr-band fr-band--tight">
        <div className="mk-wrap">
          <div className="mb-8 space-y-2 text-center">
            <span className="fr-glyph">
              <Glyph icon={UI_ICONS.leaderboard} size={26} />
            </span>
            <h1
              className="fr-display m-0 text-[2.5rem] leading-[0.975] tracking-[-0.045em] sm:text-5xl"
              style={{ color: 'var(--text)' }}
            >
              Leaderboards
            </h1>
            <p className="mx-auto max-w-md text-sm" style={{ color: 'var(--text-muted)' }}>
              See who&apos;s on top
            </p>
          </div>

          <div className="mx-auto max-w-2xl grid gap-4 sm:grid-cols-3">
            {BOARDS.map((board) => (
              <Link
                key={board.href}
                href={board.href}
                className="fr-card p-6 text-center no-underline transition-all hover:shadow-lg group"
              >
                <span className="text-4xl block mb-3">{board.emoji}</span>
                <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>
                  {board.title}
                </h2>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {board.description}
                </p>
                <span
                  className="inline-block mt-3 text-xs font-semibold transition-colors"
                  style={{ color: board.accent }}
                >
                  View leaderboard →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}
