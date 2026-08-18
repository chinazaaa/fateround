import type { Metadata } from 'next'
import { SITE_NAME, OG_IMAGE, gameLandingOgPath } from '@/lib/seo'
import { DailyChallengeGame } from '@/components/daily/DailyChallengeGame'
import { DAILY_GAME_SLUG_TO_TYPE, DAILY_GAME_LABELS, type DailyChallengeGameType } from '@/lib/daily-challenge'

export const dynamic = 'force-dynamic'

const GAME_SEO: Record<string, { title: string; description: string }> = {
  crossword: {
    title: 'Daily Crossword — Free 15×15 Puzzle, New Every Day',
    description:
      "A free daily crossword — a full 15×15 themed grid, the same for every player. Solve it and see where you rank on today's leaderboard. Prefer something quicker? Try the mini.",
  },
  'mini-crossword': {
    title: 'Daily Mini Crossword — Free 5×5 Puzzle, New Every Day',
    description:
      "A free daily mini crossword — a quick 5×5 grid, the same for everyone. Solve it in a couple of minutes and see where you rank on today's leaderboard.",
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
  'word-grouping': {
    title: 'Daily Word Grouping — Free Connections-Style Puzzle Every Day',
    description:
      "A free daily word grouping puzzle — find four groups of four words that share something in common. Same puzzle for everyone; see where you rank on today's leaderboard.",
  },
  'chess-mate': {
    title: 'Daily Chess Puzzle — Free Mate-in-Sequence Every Day',
    description:
      "A free daily chess puzzle — find the checkmate sequence. Same position for every player; solve it and see where you rank on today's leaderboard.",
  },
  'codenames-codeword': {
    title: 'Daily Codewords — Free Codenames-Style Word Puzzle Every Day',
    description:
      "A free daily Codewords puzzle — one clue points to words hidden in the grid. Pick the ones you think match and submit. Same clue for everyone; climb today's leaderboard.",
  },
  'whot-puzzle': {
    title: 'Daily Whot Puzzle — Free Card Puzzle, New Every Day',
    description:
      'A free daily Whot puzzle — clear your hand by matching shape or number, play Whot (20) as your wild. Fewer moves score higher; see where you rank today.',
  },
  'ludo-puzzle': {
    title: 'Daily Ludo Puzzle — Free Board Game Challenge Every Day',
    description:
      "A free daily Ludo puzzle — the same board and dice rolls for everyone. Plan your moves, get all four tokens home in as few rolls as you can, and climb today's leaderboard.",
  },
  wordle: {
    title: 'Daily Wordle — Free 5-Letter Word Puzzle, New Every Day',
    description:
      "A free daily Wordle — the same word for everyone. Guess the word in six tries or fewer and climb today's leaderboard. Naija Slang days included.",
  },
}

const GAME_KEYWORDS: Record<string, string[]> = {
  sudoku: ['daily sudoku', 'sudoku puzzle today', 'free daily sudoku', 'sudoku of the day'],
  'word-hunt': ['daily word hunt', 'word hunt puzzle', 'boggle daily', 'find words daily', 'boggle style puzzle'],
  crossword: ['daily crossword', 'free daily crossword', 'crossword puzzle today', 'full crossword'],
  'mini-crossword': [
    'mini crossword',
    'daily mini crossword',
    'quick crossword',
    '5x5 crossword',
    'mini crossword today',
  ],
  'word-search': ['daily word search', 'word search today', 'free word search puzzle', 'word find daily'],
  'word-scramble': ['daily word scramble', 'word scramble today', 'daily anagram', 'unscramble words daily'],
  trivia: ['daily trivia', 'trivia quiz today', 'daily trivia questions', 'free daily trivia', 'question of the day'],
  'word-grouping': [
    'connections',
    'connections game',
    'daily connections',
    'word grouping',
    'connections alternative',
    'free connections puzzle',
  ],
  'chess-mate': ['daily chess puzzle', 'mate in 2', 'checkmate puzzle', 'chess puzzle today', 'chess tactics daily'],
  'codenames-codeword': [
    'daily codewords',
    'codenames puzzle',
    'codewords game',
    'daily word clue puzzle',
    'codenames style game',
  ],
  'whot-puzzle': ['daily whot puzzle', 'whot card game', 'whot puzzle', 'daily card puzzle', 'play whot online'],
  'ludo-puzzle': ['daily ludo puzzle', 'ludo puzzle', 'ludo board game', 'free ludo online', 'ludo king alternative'],
  wordle: ['daily wordle', 'wordle today', 'free wordle', 'wordle online', 'wordle alternative'],
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
