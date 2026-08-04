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
        <p className="text-muted mt-4">Calculating your score...</p>
      </div>
    )
  }

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

  const emoji = score >= 900 ? '🏆' : score >= 700 ? '🎯' : score >= 400 ? '👍' : '💪'

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="glass-card-strong p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          {/* Trophy emoji with glow */}
          <div
            className="text-5xl mb-3"
            style={{
              filter: 'drop-shadow(0 6px 14px color-mix(in srgb, var(--primary) 25%, transparent))',
            }}
          >
            {emoji}
          </div>

          {/* Title */}
          <div className="label-caps mb-4">
            Daily {DAILY_GAME_LABELS[gameType]} #{challengeNumber}
          </div>

          {/* Score — hero treatment */}
          <div className="my-2">
            <span className="text-6xl font-black tabular-nums gradient-title inline-block">
              <AnimatedScore target={score} />
            </span>
            <span className="text-xl text-faint ml-1 font-medium">/ 1000</span>
          </div>

          {/* New personal best */}
          {isNewBest && (
            <div className="mt-2 inline-flex items-center gap-1.5 glass-card px-3 py-1 text-sm font-semibold text-primary animate-bounce">
              <span>⭐</span> New Personal Best!
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 w-full mt-6 animate-stagger">
            <div className="glass-card p-3 text-center">
              <div className="text-xl font-black tabular-nums">{formatTime(timeSeconds)}</div>
              <div className="text-faint text-[10px] uppercase tracking-wider font-semibold mt-1">Time</div>
            </div>
            <div className="glass-card p-3 text-center">
              <div className="text-xl font-black tabular-nums">
                {itemsSolved}/{itemsTotal}
              </div>
              <div className="text-faint text-[10px] uppercase tracking-wider font-semibold mt-1">Solved</div>
            </div>
            {rank && (
              <div className="glass-card p-3 text-center">
                <div className="text-xl font-black tabular-nums">#{rank}</div>
                <div className="text-faint text-[10px] uppercase tracking-wider font-semibold mt-1">
                  of {totalPlayers}
                </div>
              </div>
            )}
          </div>

          {/* Personal best comparison */}
          {personalBest && !isNewBest && (
            <div className="mt-4 text-sm text-muted">
              Personal best: {personalBest.bestScore} pts ({personalBest.totalPlays} plays)
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 flex flex-col gap-3 w-full">
            <Link
              href={`/daily/${slug}/leaderboard`}
              className="btn-primary w-full text-center py-3 rounded-xl font-semibold"
            >
              View Leaderboard
            </Link>
            <button className="btn-secondary w-full text-center py-2.5 rounded-xl" onClick={handleShare}>
              Share Result
            </button>
            <Link href="/daily" className="btn-ghost text-sm text-center py-2">
              Back to Daily Challenges
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
