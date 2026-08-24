import type { Metadata } from 'next'
import { SITE_NAME, gameLandingOgPath } from '@/lib/seo'
import { DailyAnswersClient } from '@/components/daily/DailyAnswersClient'
import { DAILY_GAME_SLUG_TO_TYPE, DAILY_GAME_LABELS, type DailyChallengeGameType } from '@/lib/daily-challenge'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ gameType: string }> }): Promise<Metadata> {
  const { gameType: slug } = await params
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug] as DailyChallengeGameType | undefined
  const label = gameType ? DAILY_GAME_LABELS[gameType] : 'Daily Challenge'
  const description = `Answers to yesterday's Daily ${label}. Published a day late, so today's puzzle stays fair.`

  const ogPath = gameLandingOgPath(`daily-${slug}`)

  return {
    title: `Yesterday's Daily ${label} Answers`,
    description,
    alternates: { canonical: `/daily-challenges/${slug}/answers` },
    openGraph: {
      title: `Yesterday's Daily ${label} Answers | ${SITE_NAME}`,
      description,
      url: `/daily-challenges/${slug}/answers`,
      images: [{ url: ogPath, width: 1200, height: 630, alt: `Daily ${label} answers | ${SITE_NAME}` }],
    },
  }
}

export default async function DailyAnswersPage({ params }: { params: Promise<{ gameType: string }> }) {
  const { gameType: slug } = await params
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug]

  if (!gameType) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Game not found</h1>
      </div>
    )
  }

  return <DailyAnswersClient gameType={gameType} slug={slug} />
}
