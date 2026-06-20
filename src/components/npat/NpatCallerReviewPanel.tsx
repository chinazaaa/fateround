'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { NpatScoreboard } from '@/components/npat/NpatScoreboard'
import {
  duplicateKeysByCategory,
  isForcedInvalidAnswer,
  NPAT_CATEGORIES,
  suggestedHostReviewValidity,
} from '@/lib/npat'
import type { NpatAnswer, NpatCategory, NpatMark, NpatMetadata, Player, Round } from '@/types'
import { useToast } from '@/components/ui/Toast'

type ValidityMap = Record<string, Record<NpatCategory, boolean>>

function overridesToValidity(
  overrides: NonNullable<NpatMetadata['host_overrides']>
): ValidityMap {
  const map: ValidityMap = {}
  for (const [playerId, flags] of Object.entries(overrides)) {
    map[playerId] = Object.fromEntries(
      NPAT_CATEGORIES.map((category) => [category, flags[category] ?? false])
    ) as Record<NpatCategory, boolean>
  }
  return map
}

const OVERRIDE_PAYLOAD_KEYS: Record<NpatCategory, string> = {
  name: 'validName',
  animal: 'validAnimal',
  place: 'validPlace',
  thing: 'validThing',
  food: 'validFood',
}

function validityToPayload(validity: ValidityMap) {
  return Object.entries(validity).map(([playerId, flags]) => ({
    playerId,
    ...Object.fromEntries(
      NPAT_CATEGORIES.map((category) => [OVERRIDE_PAYLOAD_KEYS[category], flags[category]])
    ),
  }))
}

export function NpatCallerReviewPanel({
  gameCode,
  playerId,
  round,
  players,
  answers,
  marks,
  onApproved,
}: {
  gameCode: string
  playerId: string
  round: Round
  players: Player[]
  answers: NpatAnswer[]
  marks: NpatMark[]
  onApproved?: () => void
}) {
  const { error: toastError, success } = useToast()
  const metadata = round.npat_metadata as NpatMetadata | null | undefined
  const letter = metadata?.letter ?? null
  const roundAnswers = useMemo(() => answers.filter((a) => a.round_id === round.id), [answers, round.id])
  const roundMarks = useMemo(() => marks.filter((m) => m.round_id === round.id), [marks, round.id])
  const dupes = useMemo(() => duplicateKeysByCategory(roundAnswers), [roundAnswers])

  const [validity, setValidity] = useState<ValidityMap>({})
  const [approving, setApproving] = useState(false)
  const seededRoundIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (seededRoundIdRef.current === round.id) return
    if (roundAnswers.length === 0) return

    seededRoundIdRef.current = round.id
    setValidity(overridesToValidity(suggestedHostReviewValidity(roundAnswers, roundMarks, letter) ?? {}))
  }, [round.id, roundAnswers, roundMarks, letter])

  const setValid = (targetPlayerId: string, category: NpatCategory, answerText: string, valid: boolean) => {
    const normalized = answerText.trim()
    const isDuplicate = normalized ? dupes[category].has(normalized.toLowerCase()) : false
    if (isForcedInvalidAnswer(answerText, letter, isDuplicate)) return

    setValidity((prev) => ({
      ...prev,
      [targetPlayerId]: {
        ...prev[targetPlayerId],
        [category]: valid,
      },
    }))
  }

  const approveRound = async () => {
    setApproving(true)
    try {
      const res = await fetch('/api/npat/caller-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          playerId,
          roundId: round.id,
          overrides: validityToPayload(validity),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to approve round')
      success('Round approved — scores revealed!')
      await onApproved?.()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to approve round')
    } finally {
      setApproving(false)
    }
  }

  const reviewOverrides = useMemo(() => {
    const result: NonNullable<NpatMetadata['host_overrides']> = {}
    for (const [targetPlayerId, flags] of Object.entries(validity)) {
      result[targetPlayerId] = flags
    }
    return result
  }, [validity])

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 space-y-3">
        <p className="label-caps">Your approval</p>
        <p className="text-sm text-muted leading-relaxed">
          You called letter{' '}
          <strong className="text-body">{letter ?? '?'}</strong> — review everyone&apos;s answers before scores are
          revealed. Empty answers, wrong starting letters, and duplicates are invalid automatically. Toggle anything
          else, then approve.
        </p>
        <button type="button" onClick={() => void approveRound()} disabled={approving} className="btn-primary w-full">
          {approving ? 'Approving…' : 'Approve & reveal scores'}
        </button>
      </div>

      <NpatScoreboard
        letter={letter}
        players={players}
        answers={roundAnswers}
        marks={roundMarks}
        metadata={metadata ?? null}
        showScores={false}
        hostReview
        hostOverrides={reviewOverrides}
        onSetValid={setValid}
      />
    </div>
  )
}
