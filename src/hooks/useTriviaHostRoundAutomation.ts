'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useRoundTimer } from '@/hooks/useRoundTimer'
import { useTriviaRevealAdvance } from '@/hooks/useTriviaRevealAdvance'
import type { Game, Player, Round, TriviaAnswer } from '@/types'

export function useTriviaHostRoundAutomation({
  game,
  rounds,
  players,
  answers,
  advancing,
  onEndRound,
  gameCode,
  onReload,
  enabled = true,
}: {
  game: Game
  rounds: Round[]
  players: Player[]
  answers: TriviaAnswer[]
  advancing: boolean
  onEndRound: () => void
  gameCode: string
  onReload?: () => void
  enabled?: boolean
}) {
  const autoEndedRoundId = useRef<string | null>(null)
  const onEndRoundRef = useRef(onEndRound)

  useEffect(() => {
    onEndRoundRef.current = onEndRound
  })

  const currentRound = useMemo(
    () => rounds.find((r) => r.round_number === game.current_round_number) ?? null,
    [rounds, game.current_round_number]
  )
  const activeRound = currentRound?.status === 'active' ? currentRound : null
  const lastFinishedRound = useMemo(() => {
    const finished = rounds.filter((r) => r.status === 'finished')
    return finished.length ? finished[finished.length - 1] : null
  }, [rounds])
  const betweenRounds = game.status === 'active' && !activeRound && lastFinishedRound != null
  const roundAnswers = useMemo(
    () => (currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []),
    [answers, currentRound]
  )
  const isLastRound = (game.current_round_number ?? 0) >= (game.rounds_count ?? 0)
  const allAnswered = !!activeRound && players.length > 0 && roundAnswers.length >= players.length

  useRoundTimer({
    game,
    currentRound: activeRound,
    active: enabled && !!activeRound && !advancing,
    onExpire: () => {
      if (!enabled || !activeRound || advancing) return
      if (autoEndedRoundId.current === activeRound.id) return
      autoEndedRoundId.current = activeRound.id
      onEndRoundRef.current()
    },
  })

  useEffect(() => {
    if (!enabled || !activeRound || advancing || players.length === 0) return
    if (roundAnswers.length < players.length) return
    if (autoEndedRoundId.current === activeRound.id) return
    autoEndedRoundId.current = activeRound.id
    onEndRoundRef.current()
  }, [enabled, activeRound?.id, roundAnswers.length, players.length, advancing])

  useEffect(() => {
    if (!activeRound) {
      autoEndedRoundId.current = null
    }
  }, [activeRound?.id])

  useTriviaRevealAdvance({
    gameCode,
    game,
    rounds,
    enabled: enabled && game.status === 'active',
    onAdvanced: onReload,
  })

  return { activeRound, lastFinishedRound, betweenRounds, roundAnswers, allAnswered, isLastRound }
}
