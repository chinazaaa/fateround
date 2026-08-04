import type { Metadata } from 'next'
import { SITE_NAME, OG_IMAGE } from '@/lib/seo'
import { DailyChallengeGame } from '@/components/daily/DailyChallengeGame'
import { DAILY_GAME_SLUG_TO_TYPE, DAILY_GAME_LABELS, type DailyChallengeGameType } from '@/lib/daily-challenge'

export const dynamic = 'force-dynamic'

const GAME_DESCRIPTIONS: Record<string, string> = {
  sudoku:
    "Solve today's Sudoku puzzle — same grid for everyone. One attempt, race the clock, climb the daily leaderboard.",
  word_hunt: "Find as many words as you can in today's letter grid. Same board for everyone — highest score wins.",
  crossword: "Today's daily crossword — fill the grid, beat the clock. Same clues for everyone, one attempt.",
  word_search: "Find all the hidden words in today's grid. Same puzzle for everyone, one shot at the leaderboard.",
  word_scramble: "Unscramble today's words before time runs out. Same challenge for everyone, one attempt.",
  trivia: "Answer today's trivia questions — 90 seconds, as many as you can. Same questions for everyone.",
}

const GAME_KEYWORDS: Record<string, string[]> = {
  sudoku: ['daily sudoku', 'sudoku puzzle today', 'free daily sudoku', 'sudoku of the day'],
  word_hunt: ['daily word hunt', 'word hunt puzzle', 'boggle daily', 'find words daily'],
  crossword: ['daily crossword', 'free daily crossword', 'crossword puzzle today', 'mini crossword'],
  word_search: ['daily word search', 'word search today', 'free word search puzzle', 'word find daily'],
  word_scramble: ['daily word scramble', 'word scramble today', 'daily anagram', 'unscramble words daily'],
  trivia: ['daily trivia', 'trivia quiz today', 'daily trivia questions', 'free daily trivia'],
}

export async function generateMetadata({ params }: { params: Promise<{ gameType: string }> }): Promise<Metadata> {
  const { gameType: slug } = await params
  const gameType = DAILY_GAME_SLUG_TO_TYPE[slug] as DailyChallengeGameType | undefined
  const label = gameType ? DAILY_GAME_LABELS[gameType] : 'Daily Challenge'
  const description =
    (gameType && GAME_DESCRIPTIONS[gameType]) ??
    `Play today's ${label} — same puzzle for everyone. One shot, one score.`
  const keywords = (gameType && GAME_KEYWORDS[gameType]) ?? ['daily puzzle', 'daily challenge']

  return {
    title: `Daily ${label} — Play Today's Puzzle Free`,
    description,
    keywords: [...keywords, 'daily challenge', 'free daily puzzle game', 'puzzle of the day'],
    alternates: { canonical: `/daily-challenges/${slug}` },
    openGraph: {
      title: `Daily ${label} | ${SITE_NAME}`,
      description,
      url: `/daily-challenges/${slug}`,
      images: [OG_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Daily ${label} | ${SITE_NAME}`,
      description,
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
        <p className="mt-2 text-base-content/60">This daily challenge type doesn't exist.</p>
      </div>
    )
  }

  return <DailyChallengeGame gameType={gameType} />
}
