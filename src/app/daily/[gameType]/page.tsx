import type { Metadata } from 'next'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'
import { DailyChallengeGame } from '@/components/daily/DailyChallengeGame'
import {
  DAILY_GAME_SLUG_TO_TYPE,
  DAILY_GAME_LABELS,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameType: string }>
}): Promise<Metadata> {
  const { gameType: slug } = await params
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug] as DailyChallengeGameType | undefined
  const label = gameType ? DAILY_GAME_LABELS[gameType] : 'Daily Challenge'

  return {
    title: `Daily ${label}`,
    description: `Play today's ${label} — same puzzle for everyone. One shot, one score.`,
    alternates: { canonical: `/daily/${slug}` },
    openGraph: {
      title: `Daily ${label} | ${SITE_NAME}`,
      description: `Play today's ${label} — same puzzle for everyone. One shot, one score.`,
      url: `/daily/${slug}`,
      images: [OG_IMAGE],
    },
  }
}

export default async function DailyGamePage({
  params,
}: {
  params: Promise<{ gameType: string }>
}) {
  const { gameType: slug } = await params
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug]

  if (!gameType) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Game not found</h1>
        <p className="mt-2 text-base-content/60">This daily challenge type doesn't exist.</p>
      </div>
    )
  }

  return <DailyChallengeGame gameType={gameType} />
}
