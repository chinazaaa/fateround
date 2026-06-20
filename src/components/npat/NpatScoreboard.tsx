'use client'

import {
  answerStartsWithLetter,
  answerTotal,
  computeCategoryScore,
  duplicateKeysByCategory,
  isForcedInvalidAnswer,
  NPAT_CATEGORIES,
  NPAT_CATEGORY_LABELS,
  NPAT_CATEGORY_POINTS,
  normalizeAnswer,
  playerDisplayName,
  type NpatScoreReason,
} from '@/lib/npat'
import type { NpatAnswer, NpatCategory, NpatMark, NpatMetadata, Player } from '@/types'

function scoreReasonLabel(reason: NpatScoreReason): string {
  if (reason === 'duplicate') return 'Duplicate'
  if (reason === 'wrong_letter') return 'Wrong letter'
  if (reason === 'invalid') return 'Marked invalid'
  if (reason === 'empty') return 'Empty'
  return 'Valid'
}

function scoreReasonClass(reason: NpatScoreReason, points: number): string {
  if (reason === 'duplicate') return 'text-amber-600 dark:text-amber-300'
  if (points > 0) return 'text-emerald-600 dark:text-emerald-300'
  if (reason === 'wrong_letter' || reason === 'invalid') return 'text-amber-600 dark:text-amber-300'
  return 'text-muted'
}

export function NpatScoreboard({
  letter,
  players,
  answers,
  marks,
  metadata,
  showScores,
  maskAnswers = false,
  hostReview = false,
  hostOverrides,
  onSetValid,
}: {
  letter: string | null
  players: Player[]
  answers: NpatAnswer[]
  marks: NpatMark[]
  metadata: NpatMetadata | null
  showScores: boolean
  maskAnswers?: boolean
  hostReview?: boolean
  hostOverrides?: NpatMetadata['host_overrides']
  onSetValid?: (playerId: string, category: NpatCategory, answerText: string, valid: boolean) => void
}) {
  const answersByPlayer = new Map(answers.map((a) => [a.player_id, a]))
  const dupes = duplicateKeysByCategory(answers)
  const marksByTarget = new Map(marks.map((m) => [m.target_player_id, m]))
  const markerNameByTarget = new Map<string, string>()
  if (metadata) {
    for (const [markerId, targetId] of Object.entries(metadata.reviewer_assignments)) {
      markerNameByTarget.set(targetId, playerDisplayName(markerId, players))
    }
  }

  if (players.length === 0) return null

  const lockedInCount = players.filter((p) => answersByPlayer.get(p.id)?.submitted_at).length

  return (
    <div className="glass-card p-4 space-y-3 overflow-x-auto">
      <div className="flex items-center justify-between gap-2">
        <p className="label-caps text-xs">
          {hostReview ? 'Review board' : maskAnswers ? 'Submission status' : 'Live scoreboard'}
        </p>
        {letter && (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-white font-black">
            {letter}
          </span>
        )}
      </div>
      <p className="text-faint text-xs">
        {hostReview
          ? 'Tap valid or invalid for answers you want to override. Empty, wrong-letter, and duplicate answers are locked invalid.'
          : maskAnswers
            ? `${lockedInCount}/${players.length} locked in — answers stay hidden until marking starts.`
            : 'Duplicates score 5 automatically. Reviewers mark whether each answer fits its category — everyone can see the marks.'}
      </p>

      <table className="w-full min-w-[640px] text-sm border-collapse">
        <thead>
          <tr className="text-left text-faint text-xs border-b border-[var(--border-strong)]">
            <th className="py-2 pr-2 font-semibold">Player</th>
            {NPAT_CATEGORIES.map((category) => (
              <th key={category} className="py-2 px-2 font-semibold">
                {NPAT_CATEGORY_LABELS[category]}
              </th>
            ))}
            {showScores && <th className="py-2 pl-2 font-semibold text-right">Round</th>}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const answer = answersByPlayer.get(player.id)
            const mark = marksByTarget.get(player.id)
            const reviewer = markerNameByTarget.get(player.id)
            const isLockedIn = !!answer?.submitted_at
            const roundTotal =
              showScores && answer?.score_name != null ? answerTotal(answer) : null

            return (
              <tr key={player.id} className="border-b border-[var(--border-strong)]/60 align-top">
                <td className="py-3 pr-2">
                  <p className="font-semibold">{player.name}</p>
                  {maskAnswers && (
                    <p
                      className={[
                        'text-[11px] mt-0.5 font-semibold',
                        isLockedIn ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted',
                      ].join(' ')}
                    >
                      {isLockedIn ? 'Locked in ✓' : 'Still writing…'}
                    </p>
                  )}
                  {reviewer && !hostReview && !maskAnswers && (
                    <p className="text-faint text-[11px] mt-0.5">Marked by {reviewer}</p>
                  )}
                </td>
                {NPAT_CATEGORIES.map((category) => {
                  if (maskAnswers) {
                    return (
                      <td key={category} className="py-3 px-2 text-muted text-center">
                        {isLockedIn ? '✓' : '…'}
                      </td>
                    )
                  }

                  const text = answer?.[category] ?? ''
                  const normalized = normalizeAnswer(text)
                  const isDuplicate = normalized ? dupes[category].has(normalized) : false
                  const markedValid = mark?.[`valid_${category}` as keyof NpatMark]
                  const hasMark = mark?.marked_at != null
                  const forcedInvalid = isForcedInvalidAnswer(text, letter, isDuplicate)
                  const hostValid = hostReview
                    ? hostOverrides?.[player.id]?.[category]
                    : undefined
                  const effectiveValid =
                    hostReview && typeof hostValid === 'boolean'
                      ? hostValid
                      : markedValid !== false

                  let reason: NpatScoreReason = 'empty'
                  let points = 0
                  if (showScores && answer?.score_name != null) {
                    const scoreKey = `score_${category}` as keyof NpatAnswer
                    points = (answer[scoreKey] as number | null) ?? 0
                    if (!normalized) reason = 'empty'
                    else if (letter && !answerStartsWithLetter(text, letter)) reason = 'wrong_letter'
                    else if (isDuplicate) reason = 'duplicate'
                    else if (markedValid === false) reason = 'invalid'
                    else reason = 'valid'
                  } else {
                    const preview = computeCategoryScore({
                      answer: text,
                      letter,
                      markedValid: hostReview ? effectiveValid : markedValid !== false,
                      isDuplicate,
                    })
                    points = preview.points
                    reason = preview.reason
                  }

                  return (
                    <td key={category} className="py-3 px-2">
                      <p className="font-medium">{text || '—'}</p>
                      <div className="mt-1 space-y-0.5">
                        {!normalized && <p className="text-[11px] text-muted font-semibold">Empty</p>}
                        {normalized && letter && !answerStartsWithLetter(text, letter) && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-300 font-semibold">
                            Must start with {letter}
                          </p>
                        )}
                        {isDuplicate && normalized && (
                          <p className="text-[11px] text-red-500 font-semibold">Duplicate</p>
                        )}
                        {hostReview && !forcedInvalid && (
                          <div className="grid grid-cols-2 gap-1 pt-1">
                            <button
                              type="button"
                              onClick={() => onSetValid?.(player.id, category, text, true)}
                              className={[
                                'rounded-md py-1 text-[11px] font-bold border',
                                effectiveValid
                                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200'
                                  : 'border-[var(--border-strong)] text-muted',
                              ].join(' ')}
                            >
                              Valid
                            </button>
                            <button
                              type="button"
                              onClick={() => onSetValid?.(player.id, category, text, false)}
                              className={[
                                'rounded-md py-1 text-[11px] font-bold border',
                                !effectiveValid
                                  ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-200'
                                  : 'border-[var(--border-strong)] text-muted',
                              ].join(' ')}
                            >
                              Invalid
                            </button>
                          </div>
                        )}
                        {!hostReview && hasMark && markedValid === false && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-300 font-semibold">Invalid</p>
                        )}
                        {!hostReview && hasMark && markedValid === true && normalized && !isDuplicate && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-300">Valid</p>
                        )}
                        {!hostReview && !hasMark && metadata?.phase === 'marking' && normalized && (
                          <p className="text-[11px] text-faint">Awaiting mark…</p>
                        )}
                        {showScores && (
                          <p className={`text-[11px] font-bold ${scoreReasonClass(reason, points)}`}>
                            {points}/{NPAT_CATEGORY_POINTS} · {scoreReasonLabel(reason)}
                          </p>
                        )}
                      </div>
                    </td>
                  )
                })}
                {showScores && (
                  <td className="py-3 pl-2 text-right font-black tabular-nums">{roundTotal ?? '—'}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
