'use client'

import { useDailyChallengeSession, type DailyChallengePhase } from '@/hooks/useDailyChallengeSession'
import { DailyChallengeResults } from './DailyChallengeResults'
import { DailySudokuPlay } from './DailySudokuPlay'
import { DailyWordHuntPlay } from './DailyWordHuntPlay'
import { DailyWordSearchPlay } from './DailyWordSearchPlay'
import { DailyCrosswordPlay } from './DailyCrosswordPlay'
import { DailyWordScramblePlay } from './DailyWordScramblePlay'
import { DAILY_GAME_LABELS, DAILY_GAME_EMOJIS, type DailyChallengeGameType } from '@/lib/daily-challenge'

function LoadingState({ gameType }: { gameType: DailyChallengeGameType }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="text-4xl mb-4">{DAILY_GAME_EMOJIS[gameType]}</div>
      <h1 className="text-xl font-bold">Loading Daily {DAILY_GAME_LABELS[gameType]}...</h1>
      <div className="loading loading-spinner loading-lg mt-4" />
    </div>
  )
}

function ErrorState({ error }: { error: string | null }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-error">Something went wrong</h1>
      <p className="mt-2 text-base-content/60">{error ?? 'Please try again later.'}</p>
    </div>
  )
}

function PlaySurface({
  gameType,
  puzzle,
  config,
  onSubmit,
}: {
  gameType: DailyChallengeGameType
  puzzle: Record<string, unknown>
  config: Record<string, unknown>
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}) {
  const timer = (config.timer as number) ?? 300

  switch (gameType) {
    case 'sudoku':
      return <DailySudokuPlay puzzle={puzzle.puzzle as number[][]} timer={timer} onSubmit={onSubmit} />
    case 'word_hunt':
      return (
        <DailyWordHuntPlay
          grid={puzzle.grid as string[][]}
          validWordHashes={(puzzle.valid_word_hashes as string[]) ?? []}
          timer={timer}
          onSubmit={onSubmit}
        />
      )
    case 'word_search':
      return <DailyWordSearchPlay puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'crossword':
      return <DailyCrosswordPlay puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
    case 'word_scramble':
      return <DailyWordScramblePlay puzzle={puzzle} timer={timer} onSubmit={onSubmit} />
  }
}

export function DailyChallengeGame({ gameType }: { gameType: DailyChallengeGameType }) {
  const { phase, challengeData, result, previousScore, error, submitResult } = useDailyChallengeSession(gameType)

  if (phase === 'loading') return <LoadingState gameType={gameType} />
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
    <div className="mx-auto max-w-2xl px-4 py-4">
      <div className="mb-4 text-center">
        <div className="text-3xl mb-1">{DAILY_GAME_EMOJIS[gameType]}</div>
        <h1 className="text-lg font-bold">
          Daily {DAILY_GAME_LABELS[gameType]} #{challengeData.challengeNumber}
        </h1>
        <p className="text-sm text-base-content/60">Same puzzle for everyone. One attempt.</p>
      </div>

      <PlaySurface
        gameType={gameType}
        puzzle={challengeData.puzzle}
        config={challengeData.config}
        onSubmit={submitResult}
      />
    </div>
  )
}
