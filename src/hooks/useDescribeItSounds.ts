'use client'

import { useEffect, useRef } from 'react'
import { playCorrectAnswerSound, playVoteSubmittedSound } from '@/lib/sounds'
import type { DescribeItSession, DescribeItWord } from '@/types'

/**
 * Plays cues for the active team:
 * - a success chime when a word is guessed (so the describer + team hear the point land)
 * - a soft notify when the describer sends a clue (so guessers know a new clue arrived)
 */
export function useDescribeItSounds({
  session,
  words,
  myTeam,
  myPlayerId,
  enabled,
}: {
  session: DescribeItSession | null
  words: DescribeItWord[]
  myTeam: number | null
  myPlayerId: string | null
  enabled: boolean
}) {
  const prevGuessedRef = useRef<number | null>(null)
  const prevClueRef = useRef<string | null>(null)

  const guessedCount = words.filter((w) => w.status === 'guessed').length
  const activeTeam = session?.active_team ?? null
  const onActiveTeam = myTeam != null && myTeam === activeTeam
  const isDescriber = !!myPlayerId && session?.describer_player_id === myPlayerId

  // Word guessed → success chime for the team currently playing.
  useEffect(() => {
    if (prevGuessedRef.current === null) {
      prevGuessedRef.current = guessedCount
      return
    }
    if (guessedCount > prevGuessedRef.current && enabled && onActiveTeam) {
      void playCorrectAnswerSound()
    }
    prevGuessedRef.current = guessedCount
  }, [guessedCount, enabled, onActiveTeam])

  // New / changed clue → soft notify for the guessers (not the describer who sent it).
  useEffect(() => {
    const clue = session?.current_clue ?? null
    const prev = prevClueRef.current
    prevClueRef.current = clue
    if (clue && clue !== prev && enabled && onActiveTeam && !isDescriber) {
      void playVoteSubmittedSound()
    }
  }, [session?.current_clue, enabled, onActiveTeam, isDescriber])
}
