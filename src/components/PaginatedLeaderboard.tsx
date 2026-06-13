'use client'

import { useEffect } from 'react'
import { ResultsPagination, usePagination, RESULTS_PAGE_SIZE } from '@/components/ui/ResultsPagination'

export interface LeaderboardRow {
  id: string
  name: string
  score: number
  rank?: number
}

interface PaginatedLeaderboardProps {
  title: string
  rows: LeaderboardRow[]
  pageSize?: number
  highlightId?: string | null
  scoreLabel?: (score: number) => string
}

export function PaginatedLeaderboard({
  title,
  rows,
  pageSize = RESULTS_PAGE_SIZE,
  highlightId,
  scoreLabel = (n) => `${n} correct`,
}: PaginatedLeaderboardProps) {
  const { page, totalPages, start, end, setPage, reset } = usePagination(rows.length, pageSize)

  useEffect(() => {
    reset()
  }, [rows.length, reset])

  if (rows.length === 0) return null

  const pageRows = rows.slice(start, end)

  return (
    <div className="glass-card p-5 space-y-3">
      <p className="text-muted text-xs uppercase tracking-wider">{title}</p>
      <div className="space-y-2">
        {pageRows.map((row, i) => (
          <div key={row.id} className="flex items-center justify-between text-sm">
            <span className={row.id === highlightId ? 'label-teal font-semibold' : 'text-body'}>
              {(row.rank ?? start + i + 1)}. {row.name}
              {row.id === highlightId ? ' (you)' : ''}
            </span>
            <span className="text-muted">{scoreLabel(row.score)}</span>
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
