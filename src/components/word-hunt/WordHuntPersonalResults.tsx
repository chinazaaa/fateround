'use client'

import { useMemo, useState } from 'react'
import {
  buildWordHuntWordList,
  sortWordHuntSubmissions,
  type WordHuntSubmission,
} from '@/lib/word-hunt'

const INITIAL_VISIBLE = 15

const wordListPanelClass =
  'rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_5%,var(--card-strong))] p-3 sm:p-4 shadow-[var(--card-shadow)]'

function WordTile({ children, missed = false }: { children: React.ReactNode; missed?: boolean }) {
  return (
    <span
      className={[
        'inline-flex min-w-[4.5rem] justify-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-[0.08em] border',
        missed
          ? 'bg-[var(--surface-inset-bg)] border-[var(--border)] text-muted'
          : 'bg-[var(--chip-active-bg)] border-[var(--chip-active-border)] text-[var(--chip-active-text)]',
      ].join(' ')}
    >
      {children}
    </span>
  )
}

function WordRow({ word, points, missed = false }: { word: string; points: number; missed?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <WordTile missed={missed}>{word.toUpperCase()}</WordTile>
      <span
        className={[
          'text-sm font-black tabular-nums shrink-0',
          missed ? 'text-faint' : 'text-[var(--foreground)]',
        ].join(' ')}
      >
        {points}
      </span>
    </div>
  )
}

type Props = {
  submissions: Pick<WordHuntSubmission, 'word' | 'points_awarded'>[]
  validWords?: string[]
}

export function WordHuntPersonalResults({ submissions, validWords = [] }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [revealAll, setRevealAll] = useState(false)

  const sortedFound = useMemo(() => sortWordHuntSubmissions(submissions), [submissions])
  const wordCount = sortedFound.length
  const totalScore = sortedFound.reduce((sum, entry) => sum + entry.points_awarded, 0)

  const foundSet = useMemo(
    () => new Set(sortedFound.map((entry) => entry.word.toLowerCase())),
    [sortedFound]
  )
  const allWords = useMemo(
    () => (validWords.length > 0 ? buildWordHuntWordList(validWords, foundSet) : []),
    [foundSet, validWords]
  )

  const missedCount = allWords.filter((entry) => !entry.found).length
  const visibleFound = expanded ? sortedFound : sortedFound.slice(0, INITIAL_VISIBLE)
  const remainingFound = Math.max(0, sortedFound.length - INITIAL_VISIBLE)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[var(--card-strong)] px-4 py-3 shadow-[var(--card-shadow)]">
        <div className="flex items-end gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Words</p>
            <p className="text-3xl font-black tabular-nums leading-none mt-1">{wordCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Score</p>
            <p className="text-3xl font-black tabular-nums leading-none mt-1">{totalScore}</p>
          </div>
        </div>
      </div>

      {sortedFound.length > 0 && (
        <div className={wordListPanelClass}>
          <div className="space-y-1">
            {visibleFound.map((entry) => (
              <WordRow key={entry.word} word={entry.word} points={entry.points_awarded} />
            ))}
          </div>
          {remainingFound > 0 && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2 text-sm font-semibold text-muted hover:text-[var(--foreground)] transition-colors"
            >
              ({remainingFound} more)
            </button>
          )}
        </div>
      )}

      {allWords.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setRevealAll((open) => !open)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] bg-[var(--card-strong)] px-4 py-3 text-sm font-black shadow-[var(--card-shadow)] active:scale-[0.99] transition-transform"
          >
            <span aria-hidden>🔍</span>
            {revealAll ? 'Hide all words' : 'Reveal all'}
            {!revealAll && missedCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-black text-white">
                {missedCount}
              </span>
            )}
          </button>

          {revealAll && (
            <div className={`${wordListPanelClass} max-h-[min(28rem,55vh)] overflow-y-auto`}>
              <div className="space-y-1">
                {allWords.map((entry) => (
                  <WordRow
                    key={entry.word}
                    word={entry.word}
                    points={entry.points}
                    missed={!entry.found}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
