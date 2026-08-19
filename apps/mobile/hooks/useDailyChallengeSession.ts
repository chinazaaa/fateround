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
      // Track which step failed so the console log names the real stage instead of a
      // catch-all "Failed to load". Every reported "trivia fails on mobile" case has
      // fallen into this catch; without a stage marker we can't tell identity vs fetch
      // vs parse apart, which is exactly the ambiguity that stalled diagnosis.
      let stage: 'identity' | 'fetch' | 'parse' | 'unknown' = 'unknown'
      try {
        stage = 'identity'
        const id = await ensureServerIdentity()
        if (cancelled) return
        setUserId(id)

        stage = 'fetch'
        const headers = await authHeaders()
        const url = apiUrl(`/api/daily-challenges/${gameType}`)
        const res = await fetch(url, { headers: headers ?? undefined })

        // Read the response as text first, then JSON.parse defensively. RN's `res.json()`
        // throws an opaque "Unexpected token …" if a CDN returns an HTML error page or
        // the body has odd bytes, and that error was landing in the catch below with no
        // clue what the server actually sent. Reading text first lets us log the first
        // 200 chars of the real payload before failing.
        stage = 'parse'
        const rawText = await res.text()
        let body: Record<string, unknown> | null = null
        try {
          body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null
        } catch (parseErr) {
          // eslint-disable-next-line no-console
          console.error('[daily-challenge] non-JSON response', {
            gameType,
            url,
            status: res.status,
            contentType: res.headers.get('content-type'),
            bodyPreview: rawText.slice(0, 200),
            parseErr,
          })
          if (!cancelled) {
            setError("Failed to load today's challenge")
            setPhase('error')
          }
          return
        }

        if (!res.ok) {
          if (!cancelled) {
            const serverMsg = typeof body?.error === 'string' ? body.error : null
            setError(serverMsg ?? "Failed to load today's challenge")
            setPhase('error')
          }
          return
        }

        const data = body as Record<string, unknown> & {
          notLive?: boolean
          launchDate?: string
          challengeId?: string
          puzzle?: Record<string, unknown>
          config?: Record<string, unknown>
          challengeNumber?: number
          timer?: number
          alreadyPlayed?: boolean
          previousScore?: Record<string, unknown>
        }
        if (cancelled) return

        if (data.notLive) {
          setLaunchDate(data.launchDate ?? null)
          setPhase('notLive')
          return
        }

        setChallengeData({
          challengeId: data.challengeId ?? '',
          puzzle: data.puzzle ?? {},
          config: data.config ?? {},
          challengeNumber: data.challengeNumber ?? 0,
          timer: data.timer ?? 0,
        })

        if (data.alreadyPlayed && data.previousScore) {
          setPreviousScore(data.previousScore)
          setPhase('results')
        } else {
          setPhase('playing')
        }
      } catch (err) {
        if (!cancelled) {
          // User-facing message stays clean; the actual error goes to the JS console
          // (dev tools / Sentry / bug reports) with the stage that failed so we can
          // distinguish an ensureServerIdentity throw from a fetch reject from a
          // response-shape problem after parse succeeded.
          // eslint-disable-next-line no-console
          console.error('[daily-challenge] load failed', { gameType, stage, err })
          setError("Failed to load today's challenge")
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
