'use client'

import Link from 'next/link'
import { formatDayLabel } from '@/lib/community-dates'
import { useDailyChallengeSession } from '@/hooks/useDailyChallengeSession'
import { DailyChallengeResults } from './DailyChallengeResults'
import { DailySudokuPlay } from './DailySudokuPlay'
import { DailyWordHuntPlay } from './DailyWordHuntPlay'
import { DailyWordSearchPlay } from './DailyWordSearchPlay'
import { DailyCrosswordPlay } from './DailyCrosswordPlay'
import { DailyWordScramblePlay } from './DailyWordScramblePlay'
import { DailyTriviaPlay } from './DailyTriviaPlay'
import { DailyWhotPuzzlePlay } from './DailyWhotPuzzlePlay'
import { DailyWordGroupingPlay } from './DailyWordGroupingPlay'
import { DailyChessMatePlay } from './DailyChessMatePlay'
import { DailyCodenamesCodewordPlay } from './DailyCodenamesCodewordPlay'
import { DailyLudoPuzzlePlay } from './DailyLudoPuzzlePlay'
import {
  DAILY_GAME_LABELS,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_TIMER,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'

function LoadingState({ gameType }: { gameType: DailyChallengeGameType }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="text-4xl mb-4">{DAILY_GAME_EMOJIS[gameType]}</div>
      <h1 className="font-bold" style={{ fontSize: 'var(--text-xl)' }}>
        Loading Daily {DAILY_GAME_LABELS[gameType]}...
      </h1>
      <div className="loading loading-spinner loading-lg mt-4" />
    </div>
  )
}

function ErrorState({ error }: { error: string | null }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="font-bold text-error" style={{ fontSize: 'var(--text-xl)' }}>
        Something went wrong
      </h1>
      <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
        {error ?? 'Please try again later.'}
      </p>
    </div>
  )
}

function NotLiveState({ gameType, launchDate }: { gameType: DailyChallengeGameType; launchDate: string | null }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="text-4xl mb-3">{DAILY_GAME_EMOJIS[gameType]}</div>
      <h1 className="font-bold" style={{ fontSize: 'var(--text-xl)' }}>
        Daily Challenge starts {launchDate ? formatDayLabel(launchDate) : 'soon'}
      </h1>
      <p className="mt-2" style={{ color: 'var(--text-muted)' }}>
        Come back on launch day for Daily {DAILY_GAME_LABELS[gameType]} — same puzzle for everyone, one attempt.
      </p>
      <Link href="/games" className="fr-btn fr-btn--secondary fr-btn--sm mt-6 inline-block">
        Browse games
      </Link>
    </div>
  )
}

function PlaySurface({
  gameType,
  challengeId,
  puzzle,
  config,
  onSubmit,
}: {
  gameType: DailyChallengeGameType
  challengeId: string
  puzzle: Record<string, unknown>
  config: Record<string, unknown>
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}) {
  // Prefer the code constant so a timer change applies immediately, even to challenges whose stored
  // config.timer was baked at an older value (and to stay in sync with the submit route's scoring,
  // which uses DAILY_GAME_TIMER). Falls back to config for safety.
  const timer = DAILY_GAME_TIMER[gameType] ?? (config.timer as number) ?? 300

  switch (gameType) {
    case 'sudoku':
      return (
        <DailySudokuPlay
          challengeId={challengeId}
          puzzle={puzzle.puzzle as number[][]}
          timer={timer}
          onSubmit={onSubmit}
        />
      )
    case 'word_hunt':
      return (
        <DailyWordHuntPlay
          challengeId={challengeId}
          grid={puzzle.grid as string[][]}
          validWordHashes={(puzzle.valid_word_hashes as string[]) ?? []}
          timer={timer}
          onSubmit={onSubmit}
        />
      )
    case 'word_search':
      return <DailyWordSearchPlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'crossword':
      return <DailyCrosswordPlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'mini_crossword':
      return <DailyCrosswordPlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'word_scramble':
      return <DailyWordScramblePlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'trivia':
      return <DailyTriviaPlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'whot_puzzle':
      return <DailyWhotPuzzlePlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'word_grouping':
      return <DailyWordGroupingPlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'chess_mate':
      return <DailyChessMatePlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'codenames_codeword':
      return <DailyCodenamesCodewordPlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'ludo_puzzle':
      return <DailyLudoPuzzlePlay challengeId={challengeId} puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
  }
}

export function DailyChallengeGame({ gameType }: { gameType: DailyChallengeGameType }) {
  const { phase, challengeData, result, previousScore, error, launchDate, submitResult } =
    useDailyChallengeSession(gameType)

  if (phase === 'loading') return <LoadingState gameType={gameType} />
  if (phase === 'notLive') return <NotLiveState gameType={gameType} launchDate={launchDate} />
  if (phase === 'error') return <ErrorState error={error} />

  if (phase === 'results' || phase === 'submitting') {
    return (
      <DailyChallengeResults
        gameType={gameType}
        result={result}
        previousScore={previousScore}
        challengeNumber={challengeData?.challengeNumber ?? 0}
        submitting={phase === 'submitting'}
      />
    )
  }

  if (!challengeData) return <ErrorState error="No challenge data" />

  return (
    <div
      className={`mx-auto px-4 py-4 ${gameType === 'crossword' || gameType === 'mini_crossword' ? 'max-w-4xl' : 'max-w-2xl'}`}
    >
      <div className="mb-4 text-center">
        <div className="text-3xl mb-1">{DAILY_GAME_EMOJIS[gameType]}</div>
        <h1 className="font-bold" style={{ fontSize: 'var(--text-lg)' }}>
          Daily {DAILY_GAME_LABELS[gameType]} #{challengeData.challengeNumber}
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Same puzzle for everyone. One attempt.</p>
      </div>

      <PlaySurface
        gameType={gameType}
        challengeId={challengeData.challengeId}
        puzzle={challengeData.puzzle}
        config={challengeData.config}
        onSubmit={submitResult}
      />
    </div>
  )
}
