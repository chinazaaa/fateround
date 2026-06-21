'use client'

import { useState } from 'react'
import type { Round, Vote, Confession } from '@/types'

export function useRoundResults() {
  const [lastFinishedRound, setLastFinishedRound] = useState<Round | null>(null)
  const [lastRoundVotes, setLastRoundVotes] = useState<Vote[]>([])

  const [allVotes, setAllVotes] = useState<Vote[]>([])
  const [allRounds, setAllRounds] = useState<Round[]>([])
  const [allConfessions, setAllConfessions] = useState<Confession[]>([])
  const [allHotSeatSubmissions, setAllHotSeatSubmissions] = useState<
    { id: string; round_id: string; text: string; submission_type: string }[]
  >([])

  function resetRoundResultsState() {
    setLastFinishedRound(null)
    setLastRoundVotes([])
    setAllVotes([])
    setAllRounds([])
    setAllConfessions([])
    setAllHotSeatSubmissions([])
  }

  return {
    lastFinishedRound, lastRoundVotes,
    allVotes, allRounds, allConfessions, allHotSeatSubmissions,
    setLastFinishedRound, setLastRoundVotes,
    setAllVotes, setAllRounds, setAllConfessions, setAllHotSeatSubmissions,
    resetRoundResultsState,
  }
}

export type RoundResultsState = ReturnType<typeof useRoundResults>
