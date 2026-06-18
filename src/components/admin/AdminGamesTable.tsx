'use client'

import { useCallback, useEffect, useState } from 'react'
import { ResultsPagination } from '@/components/ui/ResultsPagination'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { GAME_TYPE_CONFIG } from '@/lib/game-types'

type AdminGame = {
  id: string
  title: string
  game_type: string
  status: string
  created_at: string
}

type GamesResponse = {
  games: AdminGame[]
  page: number
  limit: number
  total: number
  totalPages: number
}

const PAGE_SIZE = 20
const STALE_GAME_HOURS = 48

function formatGameType(type: string): string {
  return GAME_TYPE_CONFIG[type as keyof typeof GAME_TYPE_CONFIG]?.label ?? type
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

export function AdminGamesTable({ onGamesChanged }: { onGamesChanged?: () => void }) {
  const { confirm } = useConfirm()
  const { success, error } = useToast()
  const [games, setGames] = useState<AdminGame[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [endingId, setEndingId] = useState<string | null>(null)
  const [closingStale, setClosingStale] = useState(false)
  const [staleHours, setStaleHours] = useState(STALE_GAME_HOURS)
  const [staleCount, setStaleCount] = useState<number | null>(null)
  const [staleCountLoading, setStaleCountLoading] = useState(true)
  const [staleCountError, setStaleCountError] = useState('')
  const [loadError, setLoadError] = useState('')

  const loadGames = useCallback(async (pageIndex: number) => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/admin/games?page=${pageIndex}&limit=${PAGE_SIZE}`)
      const data: GamesResponse = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to load games')
      setGames(data.games)
      setPage(data.page)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load games')
      setGames([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGames(page)
  }, [page, loadGames])

  const loadStaleCount = useCallback(async (hours: number) => {
    setStaleCountLoading(true)
    setStaleCountError('')
    try {
      const res = await fetch(`/api/admin/games/close-stale?hours=${hours}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load stale game count')
      setStaleCount(data.count ?? 0)
    } catch (err) {
      setStaleCount(null)
      setStaleCountError(err instanceof Error ? err.message : 'Failed to load stale game count')
    } finally {
      setStaleCountLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStaleCount(staleHours)
  }, [loadStaleCount, staleHours])

  const refreshGames = useCallback(async () => {
    await loadGames(page)
    await loadStaleCount(staleHours)
    onGamesChanged?.()
  }, [loadGames, loadStaleCount, onGamesChanged, page, staleHours])

  const endGame = async (gameId: string) => {
    const ok = await confirm({
      title: `End game ${gameId}?`,
      message:
        'This will close the game — waiting lobbies and in-progress rounds will be ended. Players will no longer be able to join or play.',
      confirmLabel: 'End game',
      destructive: true,
    })
    if (!ok) return

    setEndingId(gameId)
    try {
      const res = await fetch(`/api/admin/games/${gameId}/end`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end game')
      success(`Game ${gameId} ended`)
      await refreshGames()
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to end game')
    } finally {
      setEndingId(null)
    }
  }

  const closeStaleGames = async () => {
    setClosingStale(true)
    try {
      const previewRes = await fetch(`/api/admin/games/close-stale?hours=${staleHours}`)
      const preview = await previewRes.json()
      if (!previewRes.ok) throw new Error(preview.error ?? 'Failed to check stale games')

      const count = preview.count ?? 0
      if (count === 0) {
        success(`No waiting or active games older than ${staleHours} hours`)
        setStaleCount(0)
        return
      }

      const ok = await confirm({
        title: `Close ${count.toLocaleString()} stale game${count === 1 ? '' : 's'}?`,
        message: `This will end every waiting or active game created more than ${staleHours} hours ago. Players will no longer be able to join or play those rooms.`,
        confirmLabel: `Close ${count.toLocaleString()} games`,
        destructive: true,
      })
      if (!ok) return

      const res = await fetch(`/api/admin/games/close-stale?hours=${staleHours}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to close stale games')

      const closed = data.closed ?? 0
      const failed = data.failed ?? 0
      if (failed > 0) {
        error(`Closed ${closed.toLocaleString()} games, but ${failed.toLocaleString()} failed`)
      } else {
        success(`Closed ${closed.toLocaleString()} stale games`)
      }
      await refreshGames()
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to close stale games')
    } finally {
      setClosingStale(false)
    }
  }

  return (
    <div className="glass-card-strong overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">All games</h2>
          {staleCountLoading ? (
            <p className="text-muted text-xs mt-1">Checking stale games…</p>
          ) : staleCountError ? (
            <p className="text-red-500 text-xs mt-1">{staleCountError}</p>
          ) : staleCount != null ? (
            <p className="text-muted text-xs mt-1">
              {staleCount.toLocaleString()} waiting/active game{staleCount === 1 ? '' : 's'} older than {staleHours}{' '}
              hour{staleHours === 1 ? '' : 's'}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <span>Older than</span>
            <input
              type="number"
              min={1}
              max={8760}
              value={staleHours}
              onChange={(e) => {
                const next = Number(e.target.value)
                if (Number.isFinite(next)) {
                  setStaleHours(Math.min(Math.max(Math.floor(next), 1), 8760))
                }
              }}
              className="input-field w-16 py-1 px-2 text-center text-xs"
              aria-label="Hours threshold for closing stale games"
            />
            <span>hours</span>
          </label>
          <button
            type="button"
            onClick={closeStaleGames}
            disabled={closingStale || staleCountLoading}
            className="chip text-xs py-1.5 px-2.5 text-red-500 border-red-500/30 disabled:opacity-50"
          >
            {closingStale ? 'Closing…' : 'Close stale games'}
          </button>
          <span className="text-muted text-sm">{total.toLocaleString()} total</span>
        </div>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-muted">Loading games…</p>
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
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {games.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted">
                      No games yet
                    </td>
                  </tr>
                ) : (
                  games.map((game) => (
                    <tr key={game.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-5 py-3 font-mono font-semibold">{game.id}</td>
                      <td className="px-5 py-3">{game.title}</td>
                      <td className="px-5 py-3">{formatGameType(game.game_type)}</td>
                      <td className="px-5 py-3 capitalize">{game.status}</td>
                      <td className="px-5 py-3 text-muted whitespace-nowrap">{formatDate(game.created_at)}</td>
                      <td className="px-5 py-3">
                        {game.status === 'active' || game.status === 'waiting' ? (
                          <button
                            type="button"
                            onClick={() => endGame(game.id)}
                            disabled={endingId === game.id}
                            className="chip text-xs py-1.5 px-2.5 text-red-500 border-red-500/30 disabled:opacity-50"
                          >
                            {endingId === game.id ? 'Ending…' : 'End game'}
                          </button>
                        ) : (
                          <span className="text-faint text-xs">—</span>
                        )}
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
              noun="games"
            />
          </div>
        </>
      )}
    </div>
  )
}
