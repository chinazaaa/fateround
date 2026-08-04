import type { Metadata } from 'next'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'
import { DailyHubClient } from '@/components/daily/DailyHubClient'

export const metadata: Metadata = {
  title: 'Daily Challenge',
  description: 'One puzzle. One shot. Compete on the global leaderboard.',
  alternates: { canonical: '/daily-challenges' },
  openGraph: {
    title: `Daily Challenge | ${SITE_NAME}`,
    description: 'One puzzle. One shot. Compete on the global leaderboard.',
    url: '/daily-challenges',
    images: [OG_IMAGE],
  },
}

export default function DailyPage() {
  return <DailyHubClient />
}
