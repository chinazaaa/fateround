'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getPlayerSession } from '@/lib/utils'
import {
  emptyAssignment,
  parseGameType,
  isThreeChoiceGame,
  isBinaryPeoplePollGame,
  isBinaryChoiceGame,
  isNeverHaveIEver,
  isPickANumber,
  isMostLikelyTo,
  isWhoSaidThis,
  isCustomGame,
  isPairAssignmentValid,
  parsePairVoteMode,
  assignPairSlot,
} from '@/lib/game-types'
import { isMltImportGame } from '@/lib/mlt'
import { getCustomSlotKeys, isCustomAssignmentValid, customAssignmentMode } from '@/lib/custom-game'
import { panUsedNumbersFromVotes, panRoundRevealed } from '@/lib/pick-a-number'
import { playVoteSubmittedSound, playConfessionSound } from '@/lib/sounds'
import { useToast } from '@/components/ui/Toast'
import type { AutoSubmitRefs } from '@/hooks/useAutoSubmit'
import type {
  Game,
  Participant,
  Player,
  Round,
  VoteAssignment,
  PairAssignmentMap,
  WyrChoice,
  PlayerGender,
} from '@/types'

import type { View } from '@/hooks/useGameSession'

export interface VoteStateDeps {
  gameCode: string
  game: Game | null
  currentRound: Round | null
  myPlayerId: string | null
  myPlayerGender: PlayerGender | null
  isViewer: boolean
  view: View
  players: Player[]
  participants: Participant[]
  autoSubmitRefs: AutoSubmitRefs
  patchCurrentRound: (patch: Partial<Round>) => void
}

export function useVoteState(deps: VoteStateDeps) {
  const {
    gameCode,
    game,
    currentRound,
    myPlayerId,
    myPlayerGender,
    isViewer,
    view,
    players,
    participants,
    autoSubmitRefs,
    patchCurrentRound,
  } = deps
  const toast = useToast()

  const [assignment, setAssignment] = useState<VoteAssignment>(emptyAssignment())
  const [pairAssignment, setPairAssignment] = useState<PairAssignmentMap>({})
  const [wyrChoice, setWyrChoice] = useState<WyrChoice | null>(null)
  const [pickedNumber, setPickedNumber] = useState<number | null>(null)
  const [panUsedNumbers, setPanUsedNumbers] = useState<ReadonlySet<number>>(new Set())
  const [mltTargetPlayerId, setMltTargetPlayerId] = useState<string | null>(null)
  const [animeChoice, setAnimeChoice] = useState<string | null>(null)
  const [customAssignments, setCustomAssignments] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [confessionText, setConfessionText] = useState('')
  const [confessionSent, setConfessionSent] = useState(false)

  const isPanGame = isPickANumber(game?.game_type)

  // Sync vote state → autoSubmit refs at render time
  autoSubmitRefs.assignmentRef.current = assignment
  autoSubmitRefs.pairAssignmentRef.current = pairAssignment
  autoSubmitRefs.customAssignmentsRef.current = customAssignments
  autoSubmitRefs.wyrChoiceRef.current = wyrChoice
  autoSubmitRefs.mltTargetPlayerIdRef.current = mltTargetPlayerId
  autoSubmitRefs.animeChoiceRef.current = animeChoice
  autoSubmitRefs.pickedNumberRef.current = pickedNumber
  autoSubmitRefs.panUsedNumbersRef.current = panUsedNumbers

  // Sync session state → autoSubmit refs at render time
  autoSubmitRefs.playersRef.current = players
  autoSubmitRefs.currentRoundRef.current = currentRound
  autoSubmitRefs.gameRef.current = game
  autoSubmitRefs.participantsRef.current = participants
  autoSubmitRefs.myPlayerIdRef.current = myPlayerId
  autoSubmitRefs.myPlayerGenderRef.current = myPlayerGender

  // PaN picker reveal fetch
  useEffect(() => {
    if (!isPanGame || view !== 'round' || !currentRound?.id || !panRoundRevealed(currentRound)) return
    const pickerId = currentRound.submitter_player_id
    if (!pickerId || pickedNumber !== null) return
    let cancelled = false
    void supabase
      .from('votes')
      .select('picked_number')
      .eq('round_id', currentRound.id)
      .eq('player_id', pickerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.picked_number) setPickedNumber(data.picked_number)
      })
    return () => {
      cancelled = true
    }
  }, [isPanGame, view, currentRound?.id, currentRound?.mlt_question, currentRound?.submitter_player_id, pickedNumber])

  // PaN used numbers fetch
  useEffect(() => {
    if (!isPanGame || view !== 'round' || !currentRound) {
      setPanUsedNumbers(new Set())
      return
    }

    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('votes')
        .select('picked_number, round_id')
        .eq('game_id', gameCode)
        .not('picked_number', 'is', null)
      if (cancelled) return
      setPanUsedNumbers(panUsedNumbersFromVotes(data ?? [], currentRound.id))
    })()

    return () => {
      cancelled = true
    }
  }, [isPanGame, view, currentRound?.id, gameCode])

  const assign = (action: keyof VoteAssignment, participantId: string) => {
    const gameType = parseGameType(game?.game_type)
    if (isBinaryPeoplePollGame(gameType) && (action === 'kiss' || action === 'kill')) {
      setPairAssignment((prev) => {
        if (!game || !currentRound) return { ...prev, [participantId]: action }
        return assignPairSlot(
          prev,
          participantId,
          action,
          currentRound.participant_ids,
          parsePairVoteMode(game.pair_vote_mode)
        )
      })
      return
    }
    setAssignment((prev) => {
      const next = { ...prev }
      ;(Object.keys(next) as (keyof VoteAssignment)[]).forEach((k) => {
        if (next[k] === participantId) next[k] = null
      })
      next[action] = participantId
      return next
    })
  }

  const handleSubmit = async () => {
    if (autoSubmitRefs.submittedRef.current || !currentRound || !myPlayerId || !game || isViewer) return
    const submitGameType = parseGameType(game.game_type)
    const roundIds = currentRound.participant_ids
    if (
      isBinaryPeoplePollGame(submitGameType) &&
      !isPairAssignmentValid(pairAssignment, roundIds, parsePairVoteMode(game.pair_vote_mode))
    ) {
      return
    }
    if (isCustomGame(submitGameType)) {
      const slotKeys = getCustomSlotKeys(game)
      const customMode = customAssignmentMode(game, roundIds.length, slotKeys)
      if (!isCustomAssignmentValid(customAssignments, roundIds, slotKeys, customMode)) return
    }
    if (isPickANumber(submitGameType)) {
      if (!pickedNumber || panUsedNumbers.has(pickedNumber)) {
        toast.error('Pick a number that has not been used yet')
        return
      }
    }
    const voteBody =
      isBinaryChoiceGame(submitGameType) || isNeverHaveIEver(submitGameType)
        ? { wyrChoice }
        : isPickANumber(submitGameType)
          ? { pickedNumber }
          : isMostLikelyTo(submitGameType)
            ? isMltImportGame(game!)
              ? { targetParticipantId: mltTargetPlayerId }
              : { targetPlayerId: mltTargetPlayerId }
            : isWhoSaidThis(submitGameType)
              ? currentRound?.anime_metadata
                ? { animeChoice: autoSubmitRefs.animeChoiceRef.current }
                : { targetParticipantId: mltTargetPlayerId }
              : isCustomGame(submitGameType)
                ? { customAssignments }
                : isBinaryPeoplePollGame(submitGameType)
                  ? {
                      pairAssignments: Object.fromEntries(
                        roundIds
                          .map((id) => [id, pairAssignment[id]] as const)
                          .filter(
                            (entry): entry is [string, 'kiss' | 'kill'] => entry[1] === 'kiss' || entry[1] === 'kill'
                          )
                      ),
                    }
                  : {
                      kiss: assignment.kiss,
                      marry: isThreeChoiceGame(submitGameType) ? assignment.marry : null,
                      kill: assignment.kill,
                    }
    const resumeToken = getPlayerSession(gameCode)?.resumeToken
    if (!resumeToken) {
      toast.error('Your player session expired — rejoin to continue')
      return
    }
    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeToken,
          roundId: currentRound.id,
          gameId: gameCode,
          ...voteBody,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to submit vote')
        return
      }
      if (isPickANumber(submitGameType) && data.revealedQuestion && currentRound) {
        patchCurrentRound({ mlt_question: data.revealedQuestion })
        if (typeof data.pickedNumber === 'number') setPickedNumber(data.pickedNumber)
      }
      autoSubmitRefs.submittedRef.current = true
      setSubmitted(true)
      playVoteSubmittedSound()
    } catch {
      toast.error('Could not submit — try again')
    }
  }

  const sendConfession = async () => {
    if (!confessionText.trim() || confessionSent) return
    const resumeToken = getPlayerSession(gameCode)?.resumeToken
    if (!resumeToken) {
      toast.error('Your player session expired — rejoin to continue')
      return
    }
    setConfessionSent(true)
    const res = await fetch('/api/confessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeToken, gameId: gameCode, roundId: currentRound?.id, text: confessionText }),
    })
    if (res.ok) playConfessionSound()
  }

  function resetVoteState() {
    autoSubmitRefs.submittedRef.current = false
    setSubmitted(false)
    setAssignment(emptyAssignment())
    setPairAssignment({})
    setWyrChoice(null)
    setPickedNumber(null)
    setMltTargetPlayerId(null)
    setCustomAssignments({})
    setAnimeChoice(null)
    setConfessionText('')
    setConfessionSent(false)
  }

  return {
    assignment,
    pairAssignment,
    wyrChoice,
    pickedNumber,
    panUsedNumbers,
    mltTargetPlayerId,
    animeChoice,
    customAssignments,
    submitted,
    confessionText,
    confessionSent,
    setAssignment,
    setPairAssignment,
    setWyrChoice,
    setPickedNumber,
    setMltTargetPlayerId,
    setAnimeChoice,
    setCustomAssignments,
    setSubmitted,
    setConfessionText,
    setPanUsedNumbers,
    assign,
    handleSubmit,
    sendConfession,
    resetVoteState,
  }
}

export type VoteState = ReturnType<typeof useVoteState>
