'use client'

import { useState, useEffect, useCallback } from 'react'
import { ensureServerIdentity, authHeaders } from '@/lib/identity'
import type { DailyChallengeGameType } from '@/lib/daily-challenge'

export type DailyChallengePhase = 'loading' | 'playing' | 'submitting' | 'results' | 'error'

export interface DailyChallengeData {
  challengeId: string
  puzzle: Record<string, unknown>
  config: Record<string, unknown>
  challengeNumber: number
  timer: number
}

export interface DailyChallengeResult {
  normalizedScore: number
  rawPoints: number
  itemsSolved: number
  itemsTotal: number
  timeSeconds: number
  hintsUsed: number
  rank: number
  totalPlayers: number
  personalBest: { bestScore: number; bestTime: number; totalPlays: number } | null
  isNewBest: boolean
}

interface UseDailyChallengeSessionReturn {
  phase: DailyChallengePhase
  userId: string | null
  challengeData: DailyChallengeData | null
  result: DailyChallengeResult | null
  previousScore: Record<string, unknown> | null
  error: string | null
  submitResult: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => Promise<void>
}

export function useDailyChallengeSession(gameType: DailyChallengeGameType): UseDailyChallengeSessionReturn {
  const [phase, setPhase] = useState<DailyChallengePhase>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [challengeData, setChallengeData] = useState<DailyChallengeData | null>(null)
  const [result, setResult] = useState<DailyChallengeResult | null>(null)
  const [previousScore, setPreviousScore] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load identity + fetch puzzle
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        // Ensure identity (anonymous auth if needed)
        const id = await ensureServerIdentity()
        if (cancelled) return
        setUserId(id)

        // Fetch today's challenge
        const headers = await authHeaders()
        const res = await fetch(`/api/daily/${gameType}`, {
          headers: headers ?? undefined,
        })

        if (!res.ok) {
          setError("Failed to load today's challenge")
          setPhase('error')
          return
        }

        const data = await res.json()
        if (cancelled) return

        setChallengeData({
          challengeId: data.challengeId,
          puzzle: data.puzzle,
          config: data.config,
          challengeNumber: data.challengeNumber,
          timer: data.timer,
        })

        if (data.alreadyPlayed && data.previousScore) {
          setPreviousScore(data.previousScore)
          setPhase('results')
        } else {
          setPhase('playing')
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load daily challenge')
          setPhase('error')
        }
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [gameType])

  const submitResult = useCallback(
    async (payload: { timeSeconds: number; submission: Record<string, unknown> }) => {
      if (!challengeData || phase !== 'playing') return
      setPhase('submitting')

      try {
        const headers = await authHeaders()
        if (!headers) {
          setError('Sign in required to submit')
          setPhase('error')
          return
        }

        const res = await fetch(`/api/daily/${gameType}/submit`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            challengeId: challengeData.challengeId,
            timeSeconds: payload.timeSeconds,
            submission: payload.submission,
          }),
        })

        if (res.status === 409) {
          setError('Already submitted')
          setPhase('results')
          return
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(body.error ?? 'Submit failed')
          setPhase('error')
          return
        }

        const data = await res.json()
        setResult(data)
        setPhase('results')
      } catch {
        setError('Failed to submit score')
        setPhase('error')
      }
    },
    [challengeData, gameType, phase]
  )

  return {
    phase,
    userId,
    challengeData,
    result,
    previousScore,
    error,
    submitResult,
  }
}
