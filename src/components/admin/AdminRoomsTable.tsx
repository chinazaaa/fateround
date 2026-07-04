'use client'

import { useCallback, useEffect, useState } from 'react'
import { ResultsPagination } from '@/components/ui/ResultsPagination'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

type AdminRoom = {
  id: string
  name: string
  is_public: boolean
  is_locked: boolean
  max_members: number | null
  created_at: string
}

type RoomsResponse = {
  rooms: AdminRoom[]
  page: number
  limit: number
  total: number
  totalPages: number
}

const PAGE_SIZE = 20

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

export function AdminRoomsTable({ onRoomsChanged }: { onRoomsChanged?: () => void }) {
  const { confirm } = useConfirm()
  const { success, error } = useToast()
  const [rooms, setRooms] = useState<AdminRoom[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')

  const loadRooms = useCallback(async (pageIndex: number) => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/admin/rooms?page=${pageIndex}&limit=${PAGE_SIZE}`)
      const data: RoomsResponse = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to load rooms')
      setRooms(data.rooms)
      setPage(data.page)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load rooms')
      setRooms([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRooms(page)
  }, [page, loadRooms])

  const refreshRooms = useCallback(async () => {
    await loadRooms(page)
    onRoomsChanged?.()
  }, [loadRooms, onRoomsChanged, page])

  const deleteRoom = async (roomId: string) => {
    const ok = await confirm({
      title: `Delete room ${roomId}?`,
      message:
        'This permanently removes the room, its members, chat, and game links. The games themselves are kept. This cannot be undone.',
      confirmLabel: 'Delete room',
      destructive: true,
    })
    if (!ok) return

    setDeletingId(roomId)
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/delete`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete room')
      success(`Room ${roomId} deleted`)
      await refreshRooms()
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to delete room')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="glass-card-strong overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">All rooms</h2>
        <span className="text-muted text-sm">{total.toLocaleString()} total</span>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-muted">Loading rooms…</p>
      ) : loadError ? (
        <p className="px-5 py-8 text-red-500">{loadError}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-faint border-b border-[var(--border)]">
                <tr>
                  <th className="px-5 py-3 font-medium">Code</th>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Visibility</th>
                  <th className="px-5 py-3 font-medium">Locked</th>
                  <th className="px-5 py-3 font-medium">Created</th>
                  <th className="px-5 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rooms.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted">
                      No rooms yet
                    </td>
                  </tr>
                ) : (
                  rooms.map((room) => (
                    <tr key={room.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-5 py-3 font-mono font-semibold">{room.id}</td>
                      <td className="px-5 py-3">{room.name}</td>
                      <td className="px-5 py-3">{room.is_public ? 'Public' : 'Private'}</td>
                      <td className="px-5 py-3">{room.is_locked ? 'Yes' : 'No'}</td>
                      <td className="px-5 py-3 text-muted whitespace-nowrap">{formatDate(room.created_at)}</td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => deleteRoom(room.id)}
                          disabled={deletingId === room.id}
                          className="chip text-xs py-1.5 px-2.5 text-red-500 border-red-500/30 disabled:opacity-50"
                        >
                          {deletingId === room.id ? 'Deleting…' : 'Delete room'}
                        </button>
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
              noun="rooms"
            />
          </div>
        </>
      )}
    </div>
  )
}
