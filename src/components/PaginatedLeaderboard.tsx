'use client'

import { useEffect } from 'react'
import { MEDALS } from '@/lib/medals'
import { ResultsPagination, usePagination, RESULTS_PAGE_SIZE } from '@/components/ui/ResultsPagination'

export interface LeaderboardRow {
  id: string
  name: string
  score: number
  rank?: number
  correctCount?: number
}

interface PaginatedLeaderboardProps {
  title: string
  rows: LeaderboardRow[]
  pageSize?: number
  highlightId?: string | null
  scoreLabel?: (score: number) => string
  totalQuestions?: number
  /**
   * Results-screen presentation: renders each standing as its own card with a
   * medal for the top three and the first-place row lifted with the primary
   * accent. Defaults to the compact inline list used in live/sidebar contexts.
   */
  emphasizeLeader?: boolean
}

export function PaginatedLeaderboard({
  title,
  rows,
  pageSize = RESULTS_PAGE_SIZE,
  highlightId,
  scoreLabel = (n) => `${n} correct`,
  totalQuestions,
  emphasizeLeader = false,
}: PaginatedLeaderboardProps) {
  const { page, totalPages, start, end, setPage, reset } = usePagination(rows.length, pageSize)

  useEffect(() => {
    reset()
  }, [rows.length, reset])

  if (rows.length === 0) return null

  const pageRows = rows.slice(start, end)

  if (emphasizeLeader) {
    return (
      <div className="space-y-3">
        <p className="text-muted text-xs uppercase tracking-wider">{title}</p>
        <div className="space-y-2">
          {pageRows.map((row, i) => {
            const rank = row.rank ?? start + i + 1
            const isLeader = rank === 1
            const isYou = row.id === highlightId
            return (
              <div
                key={row.id}
                className={
                  isLeader
                    ? 'flex items-center gap-3 rounded-xl px-4 py-3 border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))]'
                    : 'flex items-center gap-3 rounded-xl px-4 py-3 glass-card'
                }
              >
                <span
                  className={`w-7 shrink-0 text-center font-black tabular-nums ${
                    isLeader ? 'text-lg gradient-title' : 'text-base text-faint'
                  }`}
                >
                  {MEDALS[rank - 1] ?? rank}
                </span>
                <span
                  className={`min-w-0 truncate font-bold ${isLeader ? 'text-[17px] text-body' : 'text-[15px] text-body'}`}
                >
                  {row.name}
                  {isYou ? <span className="label-teal font-semibold"> (you)</span> : null}
                </span>
                <span className="ml-auto shrink-0 text-right">
                  <span className={`font-bold text-sm tabular-nums ${isLeader ? 'gradient-title' : 'text-muted'}`}>
                    {scoreLabel(row.score)}
                  </span>
                  {row.correctCount !== undefined && totalQuestions !== undefined && (
                    <span className="block text-xs text-faint tabular-nums">
                      {row.correctCount}/{totalQuestions}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
        <ResultsPagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={rows.length}
          pageSize={pageSize}
          noun="players"
        />
      </div>
    )
  }

  return (
    <div className="glass-card p-5 space-y-3">
      <p className="text-muted text-xs uppercase tracking-wider">{title}</p>
      <div className="space-y-2">
        {pageRows.map((row, i) => (
          <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
            <span className={row.id === highlightId ? 'label-teal font-semibold' : 'text-body'}>
              {row.rank ?? start + i + 1}. {row.name}
              {row.id === highlightId ? ' (you)' : ''}
            </span>
            <div className="text-right shrink-0">
              <div className="text-muted">{scoreLabel(row.score)}</div>
              {row.correctCount !== undefined && totalQuestions !== undefined && (
                <div className="text-xs text-faint tabular-nums">
                  {row.correctCount}/{totalQuestions}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <ResultsPagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={rows.length}
        pageSize={pageSize}
        noun="players"
      />
    </div>
  )
}
