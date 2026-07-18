'use client'

import { useState } from 'react'
import { normalizeAnswer, playerDisplayName } from '@/lib/landmine'
import type { LandmineAnswer, LandmineMark, Player } from '@/types'

/**
 * The review-phase panel: lists every answer with its current peer verdict pre-selected and lets
 * the reviewer (setter in manual mode, host in auto mode) flip any Valid/Void, then approve. Empty
 * answers can never be Valid. Shared by the player-embedded round view and the host watch view.
 */
export function LandmineReviewPanel({
  players,
  playerAnswers,
  roundMarks,
  submitting,
  approved,
  onApprove,
}: {
  players: Player[]
  playerAnswers: LandmineAnswer[]
  roundMarks: LandmineMark[]
  submitting: boolean
  approved: boolean
  onApprove: (verdicts: { playerId: string; valid: boolean }[]) => void
}) {
  const [verdicts, setVerdicts] = useState<Record<string, boolean>>({})
  // Default each toggle to the peer verdict already on the mark row, so the reviewer only changes
  // what they disagree with.
  const verdictFor = (id: string) => verdicts[id] ?? roundMarks.find((m) => m.target_player_id === id)?.valid ?? true

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {playerAnswers.map((a) => {
          const name = playerDisplayName(a.player_id, players)
          const hasText = !!normalizeAnswer(a.answer)
          const valid = hasText ? verdictFor(a.player_id) : false
          return (
            <div key={a.player_id} className="rounded-lg border border-white/10 px-3 py-2 space-y-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{name}</p>
                <p className="text-sm text-muted truncate">{a.answer || '(no answer)'}</p>
              </div>
              {hasText ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={approved}
                    onClick={() => setVerdicts((p) => ({ ...p, [a.player_id]: true }))}
                    className={`py-2 rounded-lg text-sm font-bold border disabled:opacity-60 ${
                      valid ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-white/10 text-muted'
                    }`}
                  >
                    ✓ Valid
                  </button>
                  <button
                    type="button"
                    disabled={approved}
                    onClick={() => setVerdicts((p) => ({ ...p, [a.player_id]: false }))}
                    className={`py-2 rounded-lg text-sm font-bold border disabled:opacity-60 ${
                      !valid ? 'border-red-500 bg-red-500/15 text-red-200' : 'border-white/10 text-muted'
                    }`}
                  >
                    ✕ Void
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted">Empty — scores 0 automatically.</p>
              )}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        disabled={submitting || approved}
        onClick={() =>
          onApprove(
            playerAnswers.map((a) => ({
              playerId: a.player_id,
              valid: !!normalizeAnswer(a.answer) && verdictFor(a.player_id),
            }))
          )
        }
        className="btn-primary w-full py-3 disabled:opacity-50"
      >
        {approved ? 'Revealing…' : 'Approve & reveal scores'}
      </button>
      <p className="text-xs text-muted text-center">
        The mine is still hidden — judge only whether each answer fits the category.
      </p>
    </div>
  )
}
