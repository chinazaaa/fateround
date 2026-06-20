'use client'

import {
  computeCategoryScore,
  duplicateKeysByCategory,
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
  if (reason === 'invalid') return 'Marked invalid'
  if (reason === 'empty') return 'Empty'
  return 'Valid'
}

function scoreReasonClass(reason: NpatScoreReason, points: number): string {
  if (points > 0) return 'text-emerald-600 dark:text-emerald-300'
  if (reason === 'duplicate') return 'text-red-600 dark:text-red-300'
  if (reason === 'invalid') return 'text-amber-600 dark:text-amber-300'
  return 'text-muted'
}

export function NpatScoreboard({
  letter,
  players,
  answers,
  marks,
  metadata,
  showScores,
}: {
  letter: string | null
  players: Player[]
  answers: NpatAnswer[]
  marks: NpatMark[]
  metadata: NpatMetadata | null
  showScores: boolean
}) {
  const roundAnswers = answers
  const dupes = duplicateKeysByCategory(roundAnswers)
  const marksByTarget = new Map(marks.map((m) => [m.target_player_id, m]))
  const markerNameByTarget = new Map<string, string>()
  if (metadata) {
    for (const [markerId, targetId] of Object.entries(metadata.reviewer_assignments)) {
      markerNameByTarget.set(targetId, playerDisplayName(markerId, players))
    }
  }

  if (roundAnswers.length === 0) return null

  return (
    <div className="glass-card p-4 space-y-3 overflow-x-auto">
      <div className="flex items-center justify-between gap-2">
        <p className="label-caps text-xs">Live scoreboard</p>
        {letter && (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500 text-white font-black">
            {letter}
          </span>
        )}
      </div>
      <p className="text-faint text-xs">
        Duplicates are detected automatically. Reviewers mark whether each answer fits its category — everyone can see
        the marks.
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
            const answer = roundAnswers.find((a) => a.player_id === player.id)
            const mark = marksByTarget.get(player.id)
            const reviewer = markerNameByTarget.get(player.id)
            const roundTotal =
              showScores && answer?.score_name != null
                ? (answer.score_name ?? 0) +
                  (answer.score_animal ?? 0) +
                  (answer.score_place ?? 0) +
                  (answer.score_thing ?? 0)
                : null

            return (
              <tr key={player.id} className="border-b border-[var(--border-strong)]/60 align-top">
                <td className="py-3 pr-2">
                  <p className="font-semibold">{player.name}</p>
                  {reviewer && (
                    <p className="text-faint text-[11px] mt-0.5">Marked by {reviewer}</p>
                  )}
                </td>
                {NPAT_CATEGORIES.map((category) => {
                  const text = answer?.[category] ?? ''
                  const normalized = normalizeAnswer(text)
                  const isDuplicate = normalized ? dupes[category].has(normalized) : false
                  const markedValid = mark?.[`valid_${category}` as keyof NpatMark]
                  const hasMark = mark?.marked_at != null

                  let reason: NpatScoreReason = 'empty'
                  let points = 0
                  if (showScores && answer?.score_name != null) {
                    const scoreKey = `score_${category}` as keyof NpatAnswer
                    points = (answer[scoreKey] as number | null) ?? 0
                    if (!normalized) reason = 'empty'
                    else if (isDuplicate) reason = 'duplicate'
                    else if (markedValid === false) reason = 'invalid'
                    else reason = 'valid'
                  } else if (normalized) {
                    const preview = computeCategoryScore({
                      answer: text,
                      markedValid: markedValid !== false,
                      isDuplicate,
                    })
                    points = preview.points
                    reason = preview.reason
                  }

                  const validFlag = mark?.[`valid_${category}` as keyof NpatMark]
                  return (
                    <td key={category} className="py-3 px-2">
                      <p className="font-medium">{text || '—'}</p>
                      <div className="mt-1 space-y-0.5">
                        {isDuplicate && normalized && (
                          <p className="text-[11px] text-red-500 font-semibold">Duplicate</p>
                        )}
                        {hasMark && validFlag === false && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-300 font-semibold">Invalid</p>
                        )}
                        {hasMark && validFlag === true && normalized && !isDuplicate && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-300">Valid</p>
                        )}
                        {!hasMark && metadata?.phase === 'marking' && normalized && (
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
