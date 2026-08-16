'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  DAILY_GAME_LABELS,
  DAILY_GAME_EMOJIS,
  DAILY_GAME_TYPE_TO_SLUG,
  DAILY_GAME_PRIMARY_METRIC,
  type DailyChallengeGameType,
} from '@/lib/daily-challenge'
import type { DailyChallengeResult } from '@/hooks/useDailyChallengeSession'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob } from '@/lib/share-image'
import { useToast } from '@/components/ui/Toast'
import { DailyNamePrompt } from './DailyNamePrompt'
import { ChampionIcon, Target01Icon, ThumbsUpIcon, BicepsFlexedIcon, StarIcon } from '@hugeicons/core-free-icons'
import { Glyph } from '@/components/icons/Glyph'

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
  const shareCardRef = useRef<HTMLDivElement>(null)
  const { success, error: toastError } = useToast()
  const [sharing, setSharing] = useState(false)

  // On submit you're usually scrolled to the bottom (near the Submit button) — jump back to the top
  // so the "Calculating…" / results view is actually in sight.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Word Hunt ('score') is shown as raw points with no "/1000"; other games use the 0–1000 score.
  const isPointsGame = DAILY_GAME_PRIMARY_METRIC[gameType] === 'score'
  const normalized = result?.normalizedScore ?? (previousScore?.normalized_score as number | undefined) ?? 0
  const rawPoints = result?.rawPoints ?? (previousScore?.raw_points as number | undefined) ?? 0
  const score = isPointsGame ? rawPoints : normalized
  const rank = result?.rank ?? null
  const totalPlayers = result?.totalPlayers ?? null
  const timeSeconds = result?.timeSeconds ?? (previousScore?.time_seconds as number | undefined) ?? 0
  const itemsSolved = result?.itemsSolved ?? (previousScore?.items_solved as number | undefined) ?? 0
  const itemsTotal = result?.itemsTotal ?? (previousScore?.items_total as number | undefined) ?? 0
  const isNewBest = result?.isNewBest ?? false
  const personalBest = result?.personalBest
  const grid = result?.grid ?? (previousScore?.grid as string | undefined) ?? ''

  const handleShare = useCallback(async () => {
    if (sharing) return
    const target = shareCardRef.current
    if (!target) return

    setSharing(true)
    try {
      const blob = await captureElementAsImage(target)
      const result = await shareImageBlob(blob, `daily-${slug}-${challengeNumber}.png`)
      if (result === 'copied') success('Image copied — paste into Stories or chat')
      else if (result === 'shared') success('Shared!')
      else success('Image downloaded')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      // Fallback to text share
      const shareText = [
        `FateRound Daily ${DAILY_GAME_LABELS[gameType]} #${challengeNumber}`,
        `Score: ${score}${isPointsGame ? ' pts' : '/1000'} | Time: ${formatTime(timeSeconds)}`,
        grid || null,
        rank && totalPlayers ? `Rank: #${rank} of ${totalPlayers}` : null,
        `fateround.com/daily-challenges/${slug}`,
      ]
        .filter(Boolean)
        .join('\n')
      try {
        if (navigator.share) await navigator.share({ text: shareText })
        else {
          await navigator.clipboard.writeText(shareText)
          success('Results copied to clipboard!')
        }
      } catch {
        toastError('Could not share results')
      }
    } finally {
      setSharing(false)
    }
  }, [
    sharing,
    slug,
    challengeNumber,
    gameType,
    score,
    isPointsGame,
    timeSeconds,
    grid,
    rank,
    totalPlayers,
    success,
    toastError,
  ])

  const copyGrid = useCallback(async () => {
    if (!grid) return
    try {
      await navigator.clipboard.writeText(grid)
      success('Grid copied — paste it anywhere!')
    } catch {
      toastError('Could not copy grid')
    }
  }, [grid, success, toastError])

  if (submitting) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="loading loading-spinner loading-lg" />
        <p className="mt-4" style={{ color: 'var(--text-muted)' }}>
          Calculating your score...
        </p>
      </div>
    )
  }

  const ResultIcon =
    score >= 900 ? ChampionIcon : score >= 700 ? Target01Icon : score >= 400 ? ThumbsUpIcon : BicepsFlexedIcon

  return (
    <div className="mx-auto max-w-sm px-4 py-8">
      <div className="fr-card fr-card--xl">
        <div className="flex flex-col items-center text-center">
          {/* Result icon */}
          <div className="flex justify-center text-[var(--primary)] mb-2">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]"
              style={{ filter: 'drop-shadow(0 4px 10px rgba(225, 29, 72, 0.2))' }}
            >
              <Glyph icon={ResultIcon} size={28} />
            </span>
          </div>

          {/* Title */}
          <p
            className="font-semibold uppercase tracking-wider mb-3"
            style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}
          >
            Daily {DAILY_GAME_LABELS[gameType]} #{challengeNumber}
          </p>

          {/* Score — hero */}
          <div className="my-1">
            <span
              className="font-black"
              style={{
                fontSize: 'var(--text-4xl)',
                fontFamily: 'var(--font-display)',
                fontFeatureSettings: '"tnum"',
                color: 'var(--primary)',
              }}
            >
              <AnimatedScore target={score} />
            </span>
            <span className="ml-1 font-medium" style={{ fontSize: 'var(--text-lg)', color: 'var(--text-faint)' }}>
              {isPointsGame ? 'pts' : '/ 1000'}
            </span>
          </div>

          {/* Explain the score so a full solve under 1000 isn't confusing. */}
          {!isPointsGame && (
            <p className="mt-1" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              800 for solving + up to 200 for speed
            </p>
          )}
          {gameType === 'trivia' && (
            <p className="mt-1" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              100 points per correct answer
            </p>
          )}
          {gameType === 'word_grouping' && (
            <p className="mt-1" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              250 per correct group, −150 per mistake
            </p>
          )}
          {gameType === 'word_hunt' && (
            <p className="mt-1" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              100–800+ pts per word by length
            </p>
          )}
          {gameType === 'whot_puzzle' && (
            <p className="mt-1" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              1000 base, −40 per extra move, −60 per draw
            </p>
          )}
          {gameType === 'codenames_codeword' && (
            <p className="mt-1" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              Find all spy words, −150 per wrong pick
            </p>
          )}
          {gameType === 'ludo_puzzle' && (
            <p className="mt-1" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              250 per token home + 50 per capture
            </p>
          )}
          {gameType === 'wordle' && (
            <p className="mt-1" style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              Guess-1 win pays 1200, last-guess pays 400
            </p>
          )}

          {/* New personal best */}
          {isNewBest && score > 0 && (
            <div className="mt-2 fr-badge fr-badge--soft font-semibold animate-bounce inline-flex items-center gap-1">
              <Glyph icon={StarIcon} size={13} className="shrink-0" /> New Personal Best!
            </div>
          )}

          {/* Stats grid */}
          <div className={`grid ${rank && score > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-3 w-full mt-5`}>
            <div
              className="rounded-xl p-3 text-center"
              style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}
            >
              <div className="font-black" style={{ fontSize: 'var(--text-xl)', fontFeatureSettings: '"tnum"' }}>
                {formatTime(timeSeconds)}
              </div>
              <div
                className="font-semibold uppercase tracking-wider mt-1"
                style={{ fontSize: '10px', color: 'var(--text-faint)' }}
              >
                Time
              </div>
            </div>
            <div
              className="rounded-xl p-3 text-center"
              style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}
            >
              <div className="font-black" style={{ fontSize: 'var(--text-xl)', fontFeatureSettings: '"tnum"' }}>
                {itemsSolved}/{itemsTotal}
              </div>
              <div
                className="font-semibold uppercase tracking-wider mt-1"
                style={{ fontSize: '10px', color: 'var(--text-faint)' }}
              >
                {gameType === 'trivia' ? 'Correct' : gameType === 'wordle' ? 'Guesses' : 'Solved'}
              </div>
            </div>
            {rank && score > 0 && (
              <div
                className="rounded-xl p-3 text-center"
                style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }}
              >
                <div className="font-black" style={{ fontSize: 'var(--text-xl)', fontFeatureSettings: '"tnum"' }}>
                  #{rank}
                </div>
                <div
                  className="font-semibold uppercase tracking-wider mt-1"
                  style={{ fontSize: '10px', color: 'var(--text-faint)' }}
                >
                  of {totalPlayers}
                </div>
              </div>
            )}
          </div>

          {/* Zero score notice */}
          {score === 0 && (
            <div className="mt-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Scores of 0 don't appear on the leaderboard
            </div>
          )}

          {/* Personal best comparison */}
          {personalBest && !isNewBest && score > 0 && (
            <div className="mt-4" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Personal best: {personalBest.bestScore} pts ({personalBest.totalPlays} plays)
            </div>
          )}

          {/* Personalize the auto-assigned leaderboard name */}
          <div className="mt-6 w-full">
            <DailyNamePrompt />
          </div>

          {/* Actions */}
          <div className="mt-5 flex flex-col gap-2.5 w-full">
            <Link href={`/daily-challenges/${slug}/leaderboard`} className="fr-btn fr-btn--primary fr-btn--block">
              View Leaderboard
            </Link>
            <button className="fr-btn fr-btn--secondary fr-btn--block" onClick={handleShare} disabled={sharing}>
              {sharing ? 'Generating...' : 'Share Result'}
            </button>
            {gameType === 'wordle' && grid && (
              <button className="fr-btn fr-btn--secondary fr-btn--block" onClick={copyGrid}>
                Copy Grid
              </button>
            )}
            <Link href="/daily-challenges" className="fr-btn fr-btn--ghost fr-btn--sm mx-auto">
              Back to Daily Challenges
            </Link>
          </div>
        </div>
      </div>

      {/* Hidden share card — captured as image */}
      <div aria-hidden style={{ position: 'fixed', left: '-9999px', top: 0, pointerEvents: 'none' }}>
        <div
          ref={shareCardRef}
          style={{
            width: 420,
            padding: 32,
            background: 'linear-gradient(145deg, #1c1c1e 0%, #2c2c2e 50%, #1c1c1e 100%)',
            color: '#fff',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            borderRadius: 24,
          }}
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 48, lineHeight: 1 }}>{DAILY_GAME_EMOJIS[gameType]}</div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.12em',
                color: 'rgba(255,255,255,0.5)',
                marginTop: 12,
              }}
            >
              Daily {DAILY_GAME_LABELS[gameType]} #{challengeNumber}
            </div>
          </div>

          {/* Score */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div
              style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, fontFeatureSettings: '"tnum"', color: '#f43f5e' }}
            >
              {score}
            </div>
            <div style={{ fontSize: 18, fontWeight: 500, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              {isPointsGame ? 'pts' : '/ 1000'}
            </div>
          </div>

          {/* Stats row */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              marginBottom: isNewBest ? 20 : 0,
            }}
          >
            <div
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '12px 8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>
                {formatTime(timeSeconds)}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.1em',
                  color: 'rgba(255,255,255,0.45)',
                  marginTop: 4,
                }}
              >
                Time
              </div>
            </div>
            <div
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 12,
                padding: '12px 8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>
                {itemsSolved}/{itemsTotal}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.1em',
                  color: 'rgba(255,255,255,0.45)',
                  marginTop: 4,
                }}
              >
                {gameType === 'trivia' ? 'Correct' : gameType === 'wordle' ? 'Guesses' : 'Solved'}
              </div>
            </div>
            {rank && (
              <div
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  padding: '12px 8px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>#{rank}</div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.1em',
                    color: 'rgba(255,255,255,0.45)',
                    marginTop: 4,
                  }}
                >
                  of {totalPlayers}
                </div>
              </div>
            )}
          </div>

          {isNewBest && (
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#fbbf24' }}>
              New Personal Best!
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
