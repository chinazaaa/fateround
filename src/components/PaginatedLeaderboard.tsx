'use client'
import { MEDALS } from '@/lib/medals'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ResultsPagination, usePagination, RESULTS_PAGE_SIZE } from '@/components/ui/ResultsPagination'

export interface LeaderboardRow {
  id: string
  name: string
  score: number
  rank?: number
  correctCount?: number
  expandDetails?: ReactNode
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

interface RowContentProps {
  row: LeaderboardRow
  i: number
  start: number
  highlightId?: string | null
  scoreLabel: (score: number) => string
  totalQuestions?: number
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
}

function RowContent({
  row,
  i,
  start,
  highlightId,
  scoreLabel,
  totalQuestions,
  expandedIds,
  onToggleExpand,
}: RowContentProps) {
  const rank = row.rank ?? start + i + 1
  const isLeader = rank === 1
  const isYou = row.id === highlightId
  const hasDetails = !!row.expandDetails
  const isExpanded = expandedIds.has(row.id)

  return (
    <>
      <div
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
        <span className={`min-w-0 truncate font-bold ${isLeader ? 'text-[17px] text-body' : 'text-[15px] text-body'}`}>
          {row.name}
          {isYou ? <span className="label-teal font-semibold"> (you)</span> : null}
        </span>
        <span className="ml-auto shrink-0 text-right flex items-center gap-2">
          <span className="flex items-baseline gap-1.5 text-nowrap">
            <span className={`font-bold text-sm tabular-nums ${isLeader ? 'gradient-title' : 'text-muted'}`}>
              {scoreLabel(row.score)}
            </span>
            {row.correctCount !== undefined && totalQuestions !== undefined && (
              <span className="text-xs text-faint tabular-nums">
                · {row.correctCount}/{totalQuestions}
              </span>
            )}
          </span>
          {hasDetails && (
            <button
              type="button"
              onClick={() => onToggleExpand(row.id)}
              className="shrink-0 text-faint hover:text-body transition-colors p-1"
              aria-label={isExpanded ? `Collapse stats for ${row.name}` : `Expand stats for ${row.name}`}
              aria-expanded={isExpanded}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
        </span>
      </div>
      {isExpanded && hasDetails && (
        <div className="px-5 pb-3 -mt-1 animate-slide-down">
          <div className="text-xs bg-[color-mix(in_srgb,var(--primary)_6%,var(--surface))] rounded-xl p-4 border border-[var(--border)] shadow-sm">
            {row.expandDetails}
          </div>
        </div>
      )}
    </>
  )
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

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  if (rows.length === 0) return null

  const pageRows = rows.slice(start, end)

  if (emphasizeLeader) {
    return (
      <div className="space-y-3">
        <p className="text-muted text-xs uppercase tracking-wider">{title}</p>
        <div className="space-y-2">
          {pageRows.map((row, i) => (
            <div key={row.id} className="space-y-0">
              <RowContent
                row={row}
                i={i}
                start={start}
                highlightId={highlightId}
                scoreLabel={scoreLabel}
                totalQuestions={totalQuestions}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpanded}
              />
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

  return (
    <div className="glass-card p-5 space-y-3">
      <p className="text-muted text-xs uppercase tracking-wider">{title}</p>
      <div className="space-y-2">
        {pageRows.map((row, i) => {
          const isExpanded = expandedIds.has(row.id)
          return (
            <div key={row.id} className="space-y-0">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className={row.id === highlightId ? 'label-teal font-semibold' : 'text-body'}>
                  {row.rank ?? start + i + 1}. {row.name}
                  {row.id === highlightId ? ' (you)' : ''}
                </span>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div className="flex items-baseline gap-1.5 text-nowrap">
                    <div className="text-muted">{scoreLabel(row.score)}</div>
                    {row.correctCount !== undefined && totalQuestions !== undefined && (
                      <div className="text-xs text-faint tabular-nums">
                        · {row.correctCount}/{totalQuestions}
                      </div>
                    )}
                  </div>
                  {row.expandDetails && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(row.id)}
                      className="shrink-0 text-faint hover:text-body transition-colors p-1"
                      aria-label={isExpanded ? `Collapse stats for ${row.name}` : `Expand stats for ${row.name}`}
                      aria-expanded={isExpanded}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && row.expandDetails && (
                <div className="pt-2 pb-1 animate-slide-down">
                  <div className="text-xs bg-[color-mix(in_srgb,var(--primary)_6%,var(--surface))] rounded-xl p-4 border border-[var(--border)] shadow-sm">
                    {row.expandDetails}
                  </div>
                </div>
              )}
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
