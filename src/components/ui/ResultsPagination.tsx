'use client'

import { useCallback, useMemo, useState } from 'react'

export const RESULTS_PAGE_SIZE = 10

export function usePagination(itemCount: number, pageSize = RESULTS_PAGE_SIZE) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(itemCount / pageSize))
  const safePage = Math.min(page, totalPages - 1)

  const slice = useMemo(() => {
    const start = safePage * pageSize
    return { start, end: start + pageSize }
  }, [safePage, pageSize])

  const reset = useCallback(() => setPage(0), [])

  return {
    page: safePage,
    totalPages,
    pageSize,
    start: slice.start,
    end: slice.end,
    setPage,
    reset,
  }
}

export function ResultsPagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize = RESULTS_PAGE_SIZE,
  noun = 'items',
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  totalItems: number
  pageSize?: number
  noun?: string
}) {
  if (totalItems <= pageSize) return null

  const from = page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, totalItems)

  return (
    <div className="pt-1 space-y-1.5">
      <p className="text-faint text-xs text-center">
        {from}–{to} of {totalItems} {noun}
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="chip text-xs py-1 px-2.5 disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-faint text-xs tabular-nums">
          {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="chip text-xs py-1 px-2.5 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
