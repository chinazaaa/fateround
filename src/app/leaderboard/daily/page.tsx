import type { Metadata } from 'next'
import Link from 'next/link'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'
import { SiteChrome } from '@/components/SiteChrome'
import {
  DAILY_GAME_LABELS,
  DAILY_GAME_TYPE_TO_SLUG,
  DAILY_GAME_EMOJIS,
  DAILY_CHALLENGE_GAME_TYPES,
} from '@/lib/daily-challenge'

export const metadata: Metadata = {
  title: 'Daily Challenge Leaderboards',
  description: "See who topped today's daily puzzles. Pick a game and check the scores.",
  alternates: { canonical: '/leaderboard/daily' },
  openGraph: {
    title: `Daily Challenge Leaderboards | ${SITE_NAME}`,
    description: "See who topped today's daily puzzles. Pick a game and check the scores.",
    url: '/leaderboard/daily',
    images: [OG_IMAGE],
  },
}

export default function DailyLeaderboardIndex() {
  return (
    <SiteChrome>
      <div className="fr-band fr-band--tight">
        <div className="mk-wrap">
          <div className="mb-6 space-y-2 text-center">
            <Link
              href="/leaderboard"
              className="text-xs font-semibold no-underline"
              style={{ color: 'var(--text-faint)' }}
            >
              ← Leaderboards
            </Link>
            <h1 className="fr-display m-0 text-3xl tracking-tight sm:text-4xl" style={{ color: 'var(--text)' }}>
              Daily Challenges
            </h1>
            <p className="mx-auto max-w-md text-sm" style={{ color: 'var(--text-muted)' }}>
              Pick a puzzle to see today&apos;s top scores
            </p>
          </div>

          <div className="mx-auto max-w-2xl grid grid-cols-2 sm:grid-cols-3 gap-3">
            {DAILY_CHALLENGE_GAME_TYPES.map((gt) => {
              const slug = DAILY_GAME_TYPE_TO_SLUG[gt]
              return (
                <Link
                  key={gt}
                  href={`/daily-challenges/${slug}/leaderboard`}
                  className="fr-card p-5 text-center no-underline transition-all hover:shadow-md"
                  style={{ '--lift-hover': 'translateY(-2px)' } as React.CSSProperties}
                >
                  <span className="text-2xl block mb-2">{DAILY_GAME_EMOJIS[gt]}</span>
                  <span className="text-sm font-semibold block" style={{ color: 'var(--text)' }}>
                    {DAILY_GAME_LABELS[gt]}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}
