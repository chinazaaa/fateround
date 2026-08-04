import type { Metadata } from 'next'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'
import { DailyHubClient } from '@/components/daily/DailyHubClient'

const TITLE = 'Daily Challenges — Free Daily Puzzle Games'
const DESCRIPTION =
  'A new puzzle every day — crossword, word search, word scramble, trivia, Sudoku and more. Same challenge for everyone. Play free and climb the daily leaderboard.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'daily challenge',
    'daily puzzle',
    'daily word puzzle',
    'daily crossword',
    'daily trivia',
    'wordle alternative',
    'free daily puzzle game',
    'puzzle of the day',
    'daily word search',
    'daily word scramble',
    'daily sudoku',
  ],
  alternates: { canonical: '/daily-challenges' },
  openGraph: {
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    url: '/daily-challenges',
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
  },
}

export default function DailyPage() {
  return <DailyHubClient />
}
