'use client'

import { useEffect, useMemo, useRef } from 'react'
import { revealCountdownSeconds } from '@/lib/trivia'
import type { Game, Round } from '@/types'

const RETRYABLE_CODES = new Set(['reveal_pending', 'not_finished', 'not_active'])

export function useTriviaRevealAdvance({
  gameCode,
  game,
  rounds,
  enabled = true,
  onAdvanced,
}: {
  gameCode: string
  game: Game
  rounds: Round[]
  enabled?: boolean
  onAdvanced?: () => void
}) {
  const attemptedRoundId = useRef<string | null>(null)
  const inFlight = useRef(false)
  const onAdvancedRef = useRef(onAdvanced)

  useEffect(() => {
    onAdvancedRef.current = onAdvanced
  })

  const currentRound = useMemo(
    () => rounds.find((r) => r.round_number === game.current_round_number) ?? null,
    [rounds, game.current_round_number]
  )

  useEffect(() => {
    if (currentRound?.status === 'active') {
      attemptedRoundId.current = null
    }
  }, [currentRound?.id, currentRound?.status])

  useEffect(() => {
    if (!enabled || game.status !== 'active') return
    if (!currentRound || currentRound.status !== 'finished' || !currentRound.ended_at) return

    const finishedRoundId = currentRound.id
    const endedAt = currentRound.ended_at

    const tryAdvance = async () => {
      if (revealCountdownSeconds(endedAt) > 0) return
      if (attemptedRoundId.current === finishedRoundId || inFlight.current) return

      inFlight.current = true
      attemptedRoundId.current = finishedRoundId
      try {
        const res = await fetch('/api/trivia/advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode }),
        })
        const data = (await res.json()) as { code?: string; ok?: boolean }

        if (
          res.ok ||
          data.code === 'already_done' ||
          data.code === 'advanced_next' ||
          data.code === 'advanced_finish'
        ) {
          onAdvancedRef.current?.()
          return
        }

        if (data.code && RETRYABLE_CODES.has(data.code)) {
          attemptedRoundId.current = null
        }
      } catch {
        attemptedRoundId.current = null
      } finally {
        inFlight.current = false
      }
    }

    void tryAdvance()
    const id = window.setInterval(() => void tryAdvance(), 500)
    return () => window.clearInterval(id)
  }, [enabled, game.status, gameCode, currentRound?.id, currentRound?.status, currentRound?.ended_at])
}
