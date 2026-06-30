import type { Metadata } from 'next'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'
import { LeaderboardClient } from './LeaderboardClient'

export const metadata: Metadata = {
  title: 'Community Leaderboard',
  description: 'Nightly winners from the community games — daily champions, plus top players of the week and month.',
  alternates: { canonical: '/leaderboard' },
  openGraph: {
    title: `Community Leaderboard | ${SITE_NAME}`,
    description: 'Nightly winners from the community games — daily champions, plus top players of the week and month.',
    url: '/leaderboard',
    images: [OG_IMAGE],
  },
}

export default function LeaderboardPage() {
  return <LeaderboardClient />
}
