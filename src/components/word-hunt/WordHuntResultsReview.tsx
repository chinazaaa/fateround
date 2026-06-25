'use client'

import { useMemo } from 'react'
import { WordHuntGrid } from '@/components/word-hunt/WordHuntGrid'
import {
  sortWordHuntSubmissions,
  type WordHuntPlayerScore,
  type WordHuntSubmission,
} from '@/lib/word-hunt'

type SubmissionWithPath = Pick<WordHuntSubmission, 'word' | 'points_awarded' | 'path' | 'player_id'>

function WordChip({
  word,
  points,
  selected,
  onClick,
}: {
  word: string
  points: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-[0.06em] border transition-colors',
        selected
          ? 'bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-strong)_100%)] text-white border-transparent shadow-[0_2px_10px_-4px_var(--primary-glow)]'
          : 'bg-[var(--chip-active-bg)] text-[var(--chip-active-text)] border-[var(--chip-active-border)] hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))]',
      ].join(' ')}
    >
      <span>{word}</span>
      <span className={selected ? 'opacity-85 tabular-nums' : 'text-faint tabular-nums font-black'}>
        {points}
      </span>
    </button>
  )
}

export function WordHuntResultsReview({
  grid,
  submissions,
  leaderboard,
  highlightPlayerId,
  highlightPath,
  highlightWord,
  onWordSelect,
  onClearHighlight,
  expandedPlayerId,
  onExpandedPlayerChange,
}: {
  grid: string[][]
  submissions: SubmissionWithPath[]
  leaderboard: WordHuntPlayerScore[]
  highlightPlayerId?: string | null
  highlightPath: number[]
  highlightWord: string | null
  onWordSelect: (word: string, path?: number[]) => void
  onClearHighlight: () => void
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
    <div className="space-y-4">
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[var(--card-strong)] p-4 shadow-[var(--card-shadow)] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="label-caps text-xs">Board review</p>
          {highlightWord ? (
            <button
              type="button"
              onClick={onClearHighlight}
              className="text-[11px] font-semibold text-muted hover:text-[var(--foreground)]"
            >
              Clear
            </button>
          ) : (
            <p className="text-[11px] text-faint">Tap a word to see its path</p>
          )}
        </div>
        {highlightWord && (
          <p className="text-center text-sm font-black uppercase tracking-[0.12em] text-[var(--foreground)]">
            {highlightWord}
          </p>
        )}
        <WordHuntGrid grid={grid} highlightPath={highlightPath} variant="review" />
      </div>

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
                          <WordChip
                            key={entry.word}
                            word={entry.word}
                            points={entry.points_awarded}
                            selected={highlightWord === entry.word.toLowerCase()}
                            onClick={() => onWordSelect(entry.word, entry.path)}
                          />
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
    </div>
  )
}
