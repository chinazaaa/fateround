'use client'

import { useState, useEffect } from 'react'
import { isHotSeat } from '@/lib/game-types'
import type { Game, Round } from '@/types'

type View = 'loading' | 'not_found' | 'join' | 'game_started_waiting' | 'late_join_choice' | 'waiting' | 'round' | 'round_results' | 'results'

export function useHotSeat({
  gameCode,
  game,
  view,
  lastFinishedRound,
}: {
  gameCode: string
  game: Game | null
  view: View
  lastFinishedRound: Round | null
}) {
  const [hotSeatText, setHotSeatText] = useState('')
  const [hotSeatType, setHotSeatType] = useState<'compliment' | 'roast' | 'observation'>('observation')
  const [hotSeatSubmitted, setHotSeatSubmitted] = useState(false)
  const [hotSeatSubmissions, setHotSeatSubmissions] = useState<{ id: string; text: string; submission_type: string }[]>(
    []
  )

  // Fetch Hot Seat submissions when entering round results
  useEffect(() => {
    if (view !== 'round_results' || !isHotSeat(game?.game_type) || !lastFinishedRound) return
    async function fetchHotSeatResults() {
      const res = await fetch(`/api/hot-seat?roundId=${lastFinishedRound!.id}&gameId=${gameCode}`)
      if (res.ok) {
        const { submissions } = await res.json()
        setHotSeatSubmissions(submissions ?? [])
      }
    }
    fetchHotSeatResults()
  }, [view, game?.game_type, lastFinishedRound, gameCode])

  function resetHotSeatState() {
    setHotSeatText('')
    setHotSeatType('observation')
    setHotSeatSubmitted(false)
    setHotSeatSubmissions([])
  }

  return {
    hotSeatText, hotSeatType, hotSeatSubmitted, hotSeatSubmissions,
    setHotSeatText, setHotSeatType, setHotSeatSubmitted, setHotSeatSubmissions,
    resetHotSeatState,
  }
}

export type HotSeatState = ReturnType<typeof useHotSeat>
