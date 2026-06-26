'use client'

import { useMemo } from 'react'
import { sortWordHuntSubmissions, type WordHuntPlayerScore, type WordHuntSubmission } from '@/lib/word-hunt'

type SubmissionWithPath = Pick<WordHuntSubmission, 'word' | 'points_awarded' | 'path' | 'player_id'>

function WordChip({ word, points }: { word: string; points: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-[0.06em] border bg-[var(--chip-active-bg)] text-[var(--chip-active-text)] border-[var(--chip-active-border)]">
      <span>{word}</span>
      <span className="text-faint tabular-nums font-black">{points}</span>
    </span>
  )
}

export function WordHuntResultsReview({
  submissions,
  leaderboard,
  highlightPlayerId,
  expandedPlayerId,
  onExpandedPlayerChange,
}: {
  submissions: SubmissionWithPath[]
  leaderboard: WordHuntPlayerScore[]
  highlightPlayerId?: string | null
  expandedPlayerId: string | null
  onExpandedPlayerChange: (playerId: string | null) => void
}) {
  const submissionsByPlayer = useMemo(() => {
    const map = new Map<string, SubmissionWithPath[]>()
    for (const submission of submissions) {
      const list = map.get(submission.player_id) ?? []
      list.push(submission)
      map.set(submission.player_id, list)
    }
    for (const [playerId, list] of map) {
      map.set(playerId, sortWordHuntSubmissions(list) as SubmissionWithPath[])
    }
    return map
  }, [submissions])

  function togglePlayer(playerId: string) {
    onExpandedPlayerChange(expandedPlayerId === playerId ? null : playerId)
  }

  return (
    <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_5%,var(--card-strong))] p-3 sm:p-4 shadow-[var(--card-shadow)] space-y-2">
      <p className="label-caps text-xs">Everyone&apos;s words</p>
      <div className="space-y-2">
        {leaderboard.map((row, i) => {
          const playerWords = submissionsByPlayer.get(row.player_id) ?? []
          const expanded = expandedPlayerId === row.player_id
          return (
            <div
              key={row.player_id}
              className={[
                'rounded-xl border overflow-hidden',
                expanded
                  ? 'border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--card-strong)]'
                  : 'border-[var(--border-strong)] bg-[var(--surface-inset-bg)]',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => togglePlayer(row.player_id)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
              >
                <p className="font-bold text-sm truncate">
                  {i === 0 ? '🏆 ' : `${i + 1}. `}
                  {row.name}
                  {row.player_id === highlightPlayerId ? ' (you)' : ''}
                </p>
                <span className="flex items-center gap-2 shrink-0 text-sm text-muted tabular-nums">
                  {row.points} pts · {row.word_count}w
                  <span
                    className={[
                      'text-muted text-lg leading-none transition-transform',
                      expanded ? 'rotate-180' : '',
                    ].join(' ')}
                    aria-hidden
                  >
                    ▾
                  </span>
                </span>
              </button>
              {expanded && (
                <div className="px-3 pb-3 border-t border-[var(--border-strong)] pt-2">
                  {playerWords.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {playerWords.map((entry) => (
                        <WordChip key={entry.word} word={entry.word} points={entry.points_awarded} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-faint py-1">No words found</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
