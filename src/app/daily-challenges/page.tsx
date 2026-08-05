import type { Metadata } from 'next'
import { SITE_NAME, gameLandingOgPath } from '@/lib/seo'
import { DailyHubClient } from '@/components/daily/DailyHubClient'

const TITLE = 'Daily Challenges — Free Daily Puzzle Games'
const DESCRIPTION =
  'A new puzzle every day — crossword, word search, word scramble, trivia, Sudoku and more. Same challenge for everyone. Play free and climb the daily leaderboard.'

const OG_PATH = gameLandingOgPath('daily-challenges')
const OG = { url: OG_PATH, width: 1200, height: 630, alt: `${TITLE} | ${SITE_NAME}` }

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
    images: [OG],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${TITLE} | ${SITE_NAME}`,
    description: DESCRIPTION,
    images: [OG_PATH],
  },
}

export default function DailyPage() {
  return <DailyHubClient />
}
