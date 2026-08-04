'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  DAILY_GAME_LABELS,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_TYPE_TO_SLUG,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import type { DailyChallengeResult } from '@/hooks/useDailyChallengeSession'

interface DailyChallengeResultsProps {
  gameType: DailyChallengeGameType
  result: DailyChallengeResult | null
  previousScore: Record<string, unknown> | null
  challengeNumber: number
  submitting: boolean
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function AnimatedScore({ target }: { target: number }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (target === 0) return
    const duration = 1500
    const start = performance.now()

    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }, [target])

  return <span>{display}</span>
}

export function DailyChallengeResults({
  gameType,
  result,
  previousScore,
  challengeNumber,
  submitting,
}: DailyChallengeResultsProps) {
  const slug = DAILY_GAME_TYPE_TO_SLUG[gameType]

  if (submitting) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="loading loading-spinner loading-lg" />
        <p className="mt-4 text-base-content/60">Calculating your score...</p>
      </div>
    )
  }

  // For already-played view with previous score data
  const score = result?.normalizedScore ?? (previousScore?.normalized_score as number | undefined) ?? 0
  const rank = result?.rank ?? null
  const totalPlayers = result?.totalPlayers ?? null
  const timeSeconds = result?.timeSeconds ?? (previousScore?.time_seconds as number | undefined) ?? 0
  const itemsSolved = result?.itemsSolved ?? (previousScore?.items_solved as number | undefined) ?? 0
  const itemsTotal = result?.itemsTotal ?? (previousScore?.items_total as number | undefined) ?? 0
  const isNewBest = result?.isNewBest ?? false
  const personalBest = result?.personalBest

  const shareText = [
    `FateRound Daily ${DAILY_GAME_LABELS[gameType]} #${challengeNumber}`,
    `Score: ${score}/1000 | Time: ${formatTime(timeSeconds)}`,
    rank && totalPlayers ? `Rank: #${rank} of ${totalPlayers}` : null,
    `fateround.com/daily/${slug}`,
  ]
    .filter(Boolean)
    .join('\n')

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ text: shareText }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(shareText)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body items-center text-center">
          {/* Header */}
          <div className="text-4xl mb-2">
            {score >= 900 ? '🏆' : score >= 700 ? '🎯' : score >= 400 ? '👍' : '💪'}
          </div>
          <h2 className="card-title text-xl">
            Daily {DAILY_GAME_LABELS[gameType]} #{challengeNumber}
          </h2>

          {/* Score */}
          <div className="my-4">
            <div className="text-5xl font-bold">
              <AnimatedScore target={score} />
              <span className="text-xl text-base-content/40 ml-1">/ 1000</span>
            </div>
          </div>

          {/* New personal best */}
          {isNewBest && (
            <div className="badge badge-warning gap-1 text-sm font-semibold animate-bounce">
              ⭐ New Personal Best!
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-4 w-full mt-4">
            <div>
              <div className="text-2xl font-bold">{formatTime(timeSeconds)}</div>
              <div className="text-xs text-base-content/60">Time</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {itemsSolved}/{itemsTotal}
              </div>
              <div className="text-xs text-base-content/60">Solved</div>
            </div>
            {rank && (
              <div>
                <div className="text-2xl font-bold">#{rank}</div>
                <div className="text-xs text-base-content/60">
                  of {totalPlayers}
                </div>
              </div>
            )}
          </div>

          {/* Personal best comparison */}
          {personalBest && !isNewBest && (
            <div className="mt-4 text-sm text-base-content/60">
              Personal best: {personalBest.bestScore} pts ({personalBest.totalPlays} plays)
            </div>
          )}

          {/* Actions */}
          <div className="card-actions mt-6 flex-col gap-2 w-full">
            <Link
              href={`/daily/${slug}/leaderboard`}
              className="btn btn-primary w-full"
            >
              View Leaderboard
            </Link>
            <button className="btn btn-outline w-full" onClick={handleShare}>
              Share Result
            </button>
            <Link href="/daily" className="btn btn-ghost btn-sm">
              Back to Daily Challenges
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
