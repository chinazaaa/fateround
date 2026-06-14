// src/hooks/useAutoSubmit.ts
'use client'

import { useEffect, useRef } from 'react'
import {
  parseGameType,
  isMostLikelyTo,
  isWhoSaidThis,
  isPairGame,
  isCustomGame,
  isThreeChoiceGame,
  isAssignmentComplete,
  voteSlots,
  parsePairVoteMode,
  isPairAssignmentValid,
  completeRandomPairAssignment,
  isBinaryChoiceGame,
} from '@/lib/game-types'
import {
  getCustomSlotKeys,
  completeRandomCustomAssignment,
  isCustomAssignmentValid,
  customAssignmentMode,
} from '@/lib/custom-game'
import { isMltImportGame, mltVoteTargets } from '@/lib/mlt'
import { wstVoteTargets } from '@/lib/who-said-this'
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

function shuffleCopy<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface AutoSubmitRefs {
  assignmentRef: React.RefObject<VoteAssignment>
  pairAssignmentRef: React.RefObject<PairAssignmentMap>
  customAssignmentsRef: React.RefObject<Record<string, string>>
  wyrChoiceRef: React.RefObject<WyrChoice | null>
  mltTargetPlayerIdRef: React.RefObject<string | null>
  animeChoiceRef: React.RefObject<string | null>
  playersRef: React.RefObject<Player[]>
  currentRoundRef: React.RefObject<Round | null>
  gameRef: React.RefObject<Game | null>
  participantsRef: React.RefObject<Participant[]>
  myPlayerIdRef: React.RefObject<string | null>
  myPlayerGenderRef: React.RefObject<PlayerGender | null>
  submittedRef: React.RefObject<boolean>
}

export function useAutoSubmit(
  gameCode: string,
  opts?: { onCustomAssignmentsChange?: (ca: Record<string, string>) => void }
): {
  refs: AutoSubmitRefs
  triggerAutoSubmit: () => Promise<boolean>
} {
  const onCustomAssignmentsChangeRef = useRef(opts?.onCustomAssignmentsChange)
  useEffect(() => {
    onCustomAssignmentsChangeRef.current = opts?.onCustomAssignmentsChange
  })
  const assignmentRef = useRef<VoteAssignment>({ kiss: null, marry: null, kill: null })
  const pairAssignmentRef = useRef<PairAssignmentMap>({})
  const customAssignmentsRef = useRef<Record<string, string>>({})
  const wyrChoiceRef = useRef<WyrChoice | null>(null)
  const mltTargetPlayerIdRef = useRef<string | null>(null)
  const animeChoiceRef = useRef<string | null>(null)
  const playersRef = useRef<Player[]>([])
  const currentRoundRef = useRef<Round | null>(null)
  const gameRef = useRef<Game | null>(null)
  const participantsRef = useRef<Participant[]>([])
  const myPlayerIdRef = useRef<string | null>(null)
  const myPlayerGenderRef = useRef<PlayerGender | null>(null)
  const submittedRef = useRef(false)

  const refs: AutoSubmitRefs = {
    assignmentRef,
    pairAssignmentRef,
    customAssignmentsRef,
    wyrChoiceRef,
    mltTargetPlayerIdRef,
    animeChoiceRef,
    playersRef,
    currentRoundRef,
    gameRef,
    participantsRef,
    myPlayerIdRef,
    myPlayerGenderRef,
    submittedRef,
  }

  async function triggerAutoSubmit(): Promise<boolean> {
    const a = { ...assignmentRef.current }
    const pa = { ...pairAssignmentRef.current }
    let wyr = wyrChoiceRef.current
    let mltTarget = mltTargetPlayerIdRef.current
    let customCa = { ...customAssignmentsRef.current }
    const plrs = playersRef.current
    const r = currentRoundRef.current
    const g = gameRef.current
    const parts = participantsRef.current
    const pid = myPlayerIdRef.current
    let animeCh = animeChoiceRef.current

    if (!r || !pid || !g) return false

    const gameType = parseGameType(g.game_type)
    const roundParts = parts.filter((p) => r.participant_ids.includes(p.id))
    const roundIds = roundParts.map((p) => p.id)
    const useRandom = g.auto_submit_behavior === 'random'
    const isAnimeWst = isWhoSaidThis(gameType) && !!r.anime_metadata

    // Only auto-fill random choices if the player has started voting
    // (picked at least one option). If they haven't touched anything, skip.
    const hasStartedVoting = isBinaryChoiceGame(gameType)
      ? !!wyr
      : isAnimeWst
        ? !!animeCh
        : isMostLikelyTo(gameType) || isWhoSaidThis(gameType)
          ? !!mltTarget
          : isCustomGame(gameType)
            ? Object.keys(customCa).length > 0
            : isPairGame(gameType)
              ? Object.values(pa).some(Boolean)
              : Object.values(a).some(Boolean)

    if (useRandom && hasStartedVoting) {
      if (isBinaryChoiceGame(gameType)) {
        wyr = Math.random() < 0.5 ? 'a' : 'b'
      } else if (isMostLikelyTo(gameType)) {
        const targets = mltVoteTargets(g, parts, plrs)
        if (targets.length > 0) {
          mltTarget = targets[Math.floor(Math.random() * targets.length)].id
        }
      } else if (isAnimeWst) {
        const choices = (r.anime_metadata as { choices: string[] }).choices
        if (choices.length > 0) {
          animeCh = choices[Math.floor(Math.random() * choices.length)]
        }
      } else if (isWhoSaidThis(gameType)) {
        const targets = wstVoteTargets(parts)
        if (targets.length > 0) {
          mltTarget = targets[Math.floor(Math.random() * targets.length)].id
        }
      } else if (isCustomGame(gameType) && g) {
        const slotKeys = getCustomSlotKeys(g)
        const customMode = customAssignmentMode(g, roundIds.length, slotKeys)
        const filled = completeRandomCustomAssignment(customCa, roundIds, slotKeys, customMode)
        customCa = { ...customCa, ...filled }
        customAssignmentsRef.current = customCa
        onCustomAssignmentsChangeRef.current?.(customCa)
      } else if (isPairGame(gameType)) {
        const pairMode = parsePairVoteMode(g.pair_vote_mode)
        if (pairMode === 'one_each' && roundIds.length === 2) {
          Object.assign(pa, completeRandomPairAssignment(pa, roundIds, pairMode))
        } else {
          for (const p of roundParts) {
            if (!pa[p.id]) pa[p.id] = Math.random() < 0.5 ? 'kiss' : 'kill'
          }
        }
      } else {
        const unassigned = voteSlots(gameType).filter((slot) => !a[slot])
        const available = shuffleCopy(roundParts.filter((p) => !Object.values(a).includes(p.id)))
        unassigned.forEach((slot, i) => {
          if (available[i]) a[slot] = available[i].id
        })
      }
    }

    let voteBody: Record<string, unknown>

    if (isBinaryChoiceGame(gameType)) {
      if (!wyr) return false
      voteBody = { wyrChoice: wyr }
    } else if (isMostLikelyTo(gameType)) {
      if (!mltTarget) return false
      voteBody = isMltImportGame(g) ? { targetParticipantId: mltTarget } : { targetPlayerId: mltTarget }
    } else if (isWhoSaidThis(gameType)) {
      if (r.submitter_player_id === pid) return false
      if (!r.quote_text) return false
      if (isAnimeWst) {
        if (!animeCh) return false
        voteBody = { animeChoice: animeCh }
      } else {
        if (!mltTarget) return false
        voteBody = { targetParticipantId: mltTarget }
      }
    } else if (isCustomGame(gameType)) {
      const slotKeys = getCustomSlotKeys(g)
      const customMode = customAssignmentMode(g, roundIds.length, slotKeys)
      if (!isCustomAssignmentValid(customCa, roundIds, slotKeys, customMode)) return false
      voteBody = { customAssignments: customCa }
    } else if (isPairGame(gameType)) {
      const pairMode = parsePairVoteMode(g.pair_vote_mode)
      if (!isPairAssignmentValid(pa, roundIds, pairMode)) return false
      voteBody = {
        pairAssignments: Object.fromEntries(
          roundIds
            .map((id) => [id, pa[id]] as const)
            .filter((entry): entry is [string, 'kiss' | 'kill'] => entry[1] === 'kiss' || entry[1] === 'kill')
        ),
      }
    } else {
      if (!isAssignmentComplete(a, gameType)) return false
      voteBody = {
        kiss: a.kiss,
        marry: isThreeChoiceGame(gameType) ? a.marry : null,
        kill: a.kill,
      }
    }

    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: pid,
          roundId: r.id,
          gameId: gameCode,
          ...voteBody,
        }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  return { refs, triggerAutoSubmit }
}
