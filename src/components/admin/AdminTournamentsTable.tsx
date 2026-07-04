'use client'

import { useCallback, useEffect, useState } from 'react'
import { ResultsPagination } from '@/components/ui/ResultsPagination'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

type AdminTournament = {
  id: string
  title: string
  status: string
  target_game_count: number | null
  created_at: string
}

type TournamentsResponse = {
  tournaments: AdminTournament[]
  page: number
  limit: number
  total: number
  totalPages: number
}

const PAGE_SIZE = 20

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

export function AdminTournamentsTable({ onTournamentsChanged }: { onTournamentsChanged?: () => void }) {
  const { confirm } = useConfirm()
  const { success, error } = useToast()
  const [tournaments, setTournaments] = useState<AdminTournament[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [endingId, setEndingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')

  const loadTournaments = useCallback(async (pageIndex: number) => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/admin/tournaments?page=${pageIndex}&limit=${PAGE_SIZE}`)
      const data: TournamentsResponse = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to load tournaments')
      setTournaments(data.tournaments)
      setPage(data.page)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load tournaments')
      setTournaments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTournaments(page)
  }, [page, loadTournaments])

  const refreshTournaments = useCallback(async () => {
    await loadTournaments(page)
    onTournamentsChanged?.()
  }, [loadTournaments, onTournamentsChanged, page])

  const endTournament = async (tournamentId: string) => {
    const ok = await confirm({
      title: `End tournament ${tournamentId}?`,
      message:
        'This marks the tournament finished and closes any in-progress matches. Standings are kept, but no further rounds can be played.',
      confirmLabel: 'End tournament',
      destructive: true,
    })
    if (!ok) return

    setEndingId(tournamentId)
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/end`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end tournament')
      success(`Tournament ${tournamentId} ended`)
      await refreshTournaments()
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to end tournament')
    } finally {
      setEndingId(null)
    }
  }

  const deleteTournament = async (tournamentId: string) => {
    const ok = await confirm({
      title: `Delete tournament ${tournamentId}?`,
      message:
        'This permanently removes the tournament, its bracket, and its standings. Linked game rooms are detached but kept. This cannot be undone.',
      confirmLabel: 'Delete tournament',
      destructive: true,
    })
    if (!ok) return

    setDeletingId(tournamentId)
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/delete`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete tournament')
      success(`Tournament ${tournamentId} deleted`)
      await refreshTournaments()
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to delete tournament')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="glass-card-strong overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">All tournaments</h2>
        <span className="text-muted text-sm">{total.toLocaleString()} total</span>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-muted">Loading tournaments…</p>
      ) : loadError ? (
        <p className="px-5 py-8 text-red-500">{loadError}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-faint border-b border-[var(--border)]">
                <tr>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Games</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted">
                      No tournaments yet
                    </td>
                  </tr>
                ) : (
                  tournaments.map((tournament) => (
                    <tr key={tournament.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-5 py-3 font-mono font-semibold">{tournament.id}</td>
                      <td className="px-5 py-3">{tournament.title}</td>
                      <td className="px-5 py-3 capitalize">{tournament.status}</td>
                      <td className="px-5 py-3 text-muted">{tournament.target_game_count ?? '—'}</td>
                      <td className="px-5 py-3 text-muted whitespace-nowrap">{formatDate(tournament.created_at)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {tournament.status !== 'finished' ? (
                            <button
                              type="button"
                              onClick={() => endTournament(tournament.id)}
                              disabled={endingId === tournament.id || deletingId === tournament.id}
                              className="chip text-xs py-1.5 px-2.5 text-red-500 border-red-500/30 disabled:opacity-50"
                            >
                              {endingId === tournament.id ? 'Ending…' : 'End tournament'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => deleteTournament(tournament.id)}
                            disabled={endingId === tournament.id || deletingId === tournament.id}
                            className="chip text-xs py-1.5 px-2.5 text-red-500 border-red-500/30 disabled:opacity-50"
                          >
                            {deletingId === tournament.id ? 'Deleting…' : 'Delete tournament'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[var(--border)] px-5 py-4">
            <ResultsPagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={total}
              pageSize={PAGE_SIZE}
              noun="tournaments"
            />
          </div>
        </>
      )}
    </div>
  )
}
