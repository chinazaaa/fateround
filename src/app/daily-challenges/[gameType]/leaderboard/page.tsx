import type { Metadata } from 'next'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'
import { DailyLeaderboardClient } from '@/components/daily/DailyLeaderboardClient'
import { DAILY_GAME_SLUG_TO_TYPE, DAILY_GAME_LABELS, type DailyChallengeGameType } from '@/lib/daily-challenge'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ gameType: string }> }): Promise<Metadata> {
  const { gameType: slug } = await params
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug] as DailyChallengeGameType | undefined
  const label = gameType ? DAILY_GAME_LABELS[gameType] : 'Daily Challenge'

  return {
    title: `${label} Leaderboard`,
    description: `Today's top scores on the Daily ${label}.`,
    alternates: { canonical: `/daily-challenges/${slug}/leaderboard` },
    openGraph: {
      title: `${label} Leaderboard | ${SITE_NAME}`,
      description: `Today's top scores on the Daily ${label}.`,
      url: `/daily-challenges/${slug}/leaderboard`,
      images: [OG_IMAGE],
    },
  }
}

export default async function DailyLeaderboardPage({ params }: { params: Promise<{ gameType: string }> }) {
  const { gameType: slug } = await params
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug]

  if (!gameType) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Game not found</h1>
      </div>
    )
  }

  return <DailyLeaderboardClient gameType={gameType} />
}
