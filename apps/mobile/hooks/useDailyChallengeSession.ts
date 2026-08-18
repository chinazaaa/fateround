/**
 * Fetch today's daily challenge, submit the result, drive the play → results
 * transition. Mobile mirror of `src/hooks/useDailyChallengeSession.ts`.
 */

import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '@/lib/config'
import { ensureServerIdentity, authHeaders } from '@/lib/identity'
import { clearDailyProgress } from '@/lib/daily-progress'
import type { DailyChallengeGameType } from '@/lib/daily-challenge'

export type DailyChallengePhase = 'loading' | 'playing' | 'submitting' | 'results' | 'error' | 'notLive'

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
  grid?: string
}

interface UseDailyChallengeSessionReturn {
  phase: DailyChallengePhase
  userId: string | null
  challengeData: DailyChallengeData | null
  result: DailyChallengeResult | null
  previousScore: Record<string, unknown> | null
  error: string | null
  launchDate: string | null
  submitResult: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => Promise<void>
}

export function useDailyChallengeSession(gameType: DailyChallengeGameType): UseDailyChallengeSessionReturn {
  const [phase, setPhase] = useState<DailyChallengePhase>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [challengeData, setChallengeData] = useState<DailyChallengeData | null>(null)
  const [result, setResult] = useState<DailyChallengeResult | null>(null)
  const [previousScore, setPreviousScore] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [launchDate, setLaunchDate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const id = await ensureServerIdentity()
        if (cancelled) return
        setUserId(id)

        const headers = await authHeaders()
        const res = await fetch(apiUrl(`/api/daily-challenges/${gameType}`), {
          headers: headers ?? undefined,
        })

        if (!res.ok) {
          const body = await res.json().catch(() => null)
          if (!cancelled) {
            setError(body?.error ?? "Failed to load today's challenge")
            setPhase('error')
          }
          return
        }

        const data = await res.json()
        if (cancelled) return

        if (data.notLive) {
          setLaunchDate(data.launchDate ?? null)
          setPhase('notLive')
          return
        }

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
      } catch (err) {
        if (!cancelled) {
          // Surface the actual message so device-side debugging isn't blind. Falling back
          // to the generic string kept the user staring at "Please try again later." with
          // no clue what failed — a TypeError from a bad JSON parse or a network reject
          // reads very differently and is the whole diagnostic.
          const message = err instanceof Error ? err.message : String(err)
          setError(`Failed to load daily challenge: ${message}`)
          setPhase('error')
        }
      }
    }

    void init()
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

        const res = await fetch(apiUrl(`/api/daily-challenges/${gameType}/submit`), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            challengeId: challengeData.challengeId,
            timeSeconds: payload.timeSeconds,
            submission: payload.submission,
          }),
        })

        if (res.status === 409) {
          await clearDailyProgress(challengeData.challengeId)
          try {
            const getRes = await fetch(apiUrl(`/api/daily-challenges/${gameType}`), { headers })
            if (getRes.ok) {
              const getData = (await getRes.json()) as { previousScore?: Record<string, unknown> | null }
              if (getData.previousScore) setPreviousScore(getData.previousScore)
            }
          } catch {
            /* best-effort */
          }
          setError('Already submitted')
          setPhase('results')
          return
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError((body as { error?: string }).error ?? 'Submit failed')
          setPhase('error')
          return
        }

        const data = (await res.json()) as DailyChallengeResult
        await clearDailyProgress(challengeData.challengeId)
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
    launchDate,
    submitResult,
  }
}
