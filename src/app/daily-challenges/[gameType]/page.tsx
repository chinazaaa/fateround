import type { Metadata } from 'next'
import { SITE_NAME, OG_IMAGE, gameLandingOgPath } from '@/lib/seo'
import { DailyChallengeGame } from '@/components/daily/DailyChallengeGame'
import { DAILY_GAME_SLUG_TO_TYPE, DAILY_GAME_LABELS, type DailyChallengeGameType } from '@/lib/daily-challenge'

export const dynamic = 'force-dynamic'

const GAME_SEO: Record<string, { title: string; description: string }> = {
  crossword: {
    title: 'Daily Crossword — Free Online Puzzle, New Every Day',
    description:
      "A free daily crossword, the same grid for everyone. Solve today's puzzle, see where you rank on the leaderboard, then come back tomorrow for a new one.",
  },
  'word-search': {
    title: 'Daily Word Search — Free Puzzle, New Every Day',
    description:
      "A free daily word search, the same grid for everyone. Find every hidden word, see where you rank on today's leaderboard, and come back tomorrow for a new one.",
  },
  'word-scramble': {
    title: 'Daily Word Scramble — Free Unscramble Puzzle Every Day',
    description:
      "A free daily word scramble, the same words for everyone. Unscramble them, see where you rank on today's leaderboard, and come back tomorrow for a new set.",
  },
  sudoku: {
    title: 'Daily Sudoku — Free Online Puzzle, New Every Day',
    description:
      "A free daily Sudoku, the same grid for everyone. Solve today's puzzle, see where you rank on the leaderboard, and come back tomorrow for a new one.",
  },
  trivia: {
    title: 'Daily Trivia — Free Quiz Question of the Day',
    description:
      "A free daily trivia quiz, the same questions for everyone. Answer fast, see where you rank on today's leaderboard, and come back tomorrow for a new set.",
  },
  'word-hunt': {
    title: 'Daily Word Hunt — Free Boggle-Style Puzzle Every Day',
    description:
      "A free daily Word Hunt, the same letter grid for everyone. Find as many words as you can, score the highest, and see where you rank on today's leaderboard.",
  },
}

const GAME_KEYWORDS: Record<string, string[]> = {
  sudoku: ['daily sudoku', 'sudoku puzzle today', 'free daily sudoku', 'sudoku of the day'],
  'word-hunt': ['daily word hunt', 'word hunt puzzle', 'boggle daily', 'find words daily', 'boggle style puzzle'],
  crossword: ['daily crossword', 'free daily crossword', 'crossword puzzle today', 'mini crossword'],
  'word-search': ['daily word search', 'word search today', 'free word search puzzle', 'word find daily'],
  'word-scramble': ['daily word scramble', 'word scramble today', 'daily anagram', 'unscramble words daily'],
  trivia: ['daily trivia', 'trivia quiz today', 'daily trivia questions', 'free daily trivia', 'question of the day'],
}

export async function generateMetadata({ params }: { params: Promise<{ gameType: string }> }): Promise<Metadata> {
  const { gameType: slug } = await params
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug] as DailyChallengeGameType | undefined
  const label = gameType ? DAILY_GAME_LABELS[gameType] : 'Daily Challenge'
  const seo = GAME_SEO[slug]
  const title = seo?.title ?? `Daily ${label} — Free Online Puzzle, New Every Day`
  const description = seo?.description ?? `Play today's ${label} — same puzzle for everyone. One shot, one score.`
  const keywords = GAME_KEYWORDS[slug] ?? ['daily puzzle', 'daily challenge']
  const ogPath = gameLandingOgPath(`daily-${slug}`)
  const ogImage = { url: ogPath, width: 1200, height: 630, alt: `${title} | ${SITE_NAME}` }

  return {
    title,
    description,
    keywords: [...keywords, 'daily challenge', 'free daily puzzle game', 'puzzle of the day'],
    alternates: { canonical: `/daily-challenges/${slug}` },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: `/daily-challenges/${slug}`,
      images: [ogImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [ogPath],
    },
  }
}

export default async function DailyGamePage({ params }: { params: Promise<{ gameType: string }> }) {
  const { gameType: slug } = await params
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug]

  if (!gameType) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Game not found</h1>
        <p className="mt-2 text-base-content/60">This daily challenge type doesn&apos;t exist.</p>
      </div>
    )
  }

  return <DailyChallengeGame gameType={gameType} />
}
