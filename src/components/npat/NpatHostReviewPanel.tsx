'use client'

import { useEffect, useMemo, useState } from 'react'
import { NpatScoreboard } from '@/components/npat/NpatScoreboard'
import {
  duplicateKeysByCategory,
  isForcedInvalidAnswer,
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
    map[playerId] = {
      name: flags.name ?? false,
      animal: flags.animal ?? false,
      place: flags.place ?? false,
      thing: flags.thing ?? false,
    }
  }
  return map
}

function validityToPayload(validity: ValidityMap) {
  return Object.entries(validity).map(([playerId, flags]) => ({
    playerId,
    validName: flags.name,
    validAnimal: flags.animal,
    validPlace: flags.place,
    validThing: flags.thing,
  }))
}

export function NpatHostReviewPanel({
  gameCode,
  hostToken,
  round,
  players,
  answers,
  marks,
  onApproved,
}: {
  gameCode: string
  hostToken: string
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

  const [validity, setValidity] = useState<ValidityMap>(() =>
    overridesToValidity(suggestedHostReviewValidity(roundAnswers, roundMarks, letter) ?? {})
  )
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    setValidity(overridesToValidity(suggestedHostReviewValidity(roundAnswers, roundMarks, letter) ?? {}))
  }, [round.id, roundAnswers, roundMarks, letter])

  const setValid = (playerId: string, category: NpatCategory, answerText: string, valid: boolean) => {
    const normalized = answerText.trim()
    const isDuplicate = normalized ? dupes[category].has(normalized.toLowerCase()) : false
    if (isForcedInvalidAnswer(answerText, letter, isDuplicate)) return

    setValidity((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [category]: valid,
      },
    }))
  }

  const approveRound = async () => {
    setApproving(true)
    try {
      const res = await fetch('/api/npat/host-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          hostToken,
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

  const hostOverrides = useMemo(() => {
    const result: NonNullable<NpatMetadata['host_overrides']> = {}
    for (const [playerId, flags] of Object.entries(validity)) {
      result[playerId] = flags
    }
    return result
  }, [validity])

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 space-y-3">
        <p className="label-caps">Host review</p>
        <p className="text-sm text-muted leading-relaxed">
          Review everyone&apos;s answers for letter{' '}
          <strong className="text-body">{letter ?? '?'}</strong>. Empty answers, wrong starting letters, and duplicates
          are invalid automatically. Toggle anything else, then approve to reveal scores.
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
        hostOverrides={hostOverrides}
        onSetValid={setValid}
      />
    </div>
  )
}
