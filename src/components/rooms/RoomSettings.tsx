'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  getRoomTimezoneOptions,
  ROOM_DESCRIPTION_MAX,
} from '@/lib/room-timezones'
import type { RoomRow as RoomApiRow } from '@/lib/room-api'

type Props = {
  open: boolean
  onClose: () => void
  roomCode: string
  creatorToken: string
  room: RoomApiRow
  onUpdated: (room: RoomApiRow) => void
}

export function RoomSettings({ open, onClose, roomCode, creatorToken, room, onUpdated }: Props) {
  const [name, setName] = useState(room.name)
  const [isPublic, setIsPublic] = useState(room.is_public)
  const [description, setDescription] = useState(room.description ?? '')
  const [timezone, setTimezone] = useState(room.timezone ?? '')
  const [maxMembers, setMaxMembers] = useState(room.max_members ? String(room.max_members) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timezoneOptions = getRoomTimezoneOptions()

  useEffect(() => {
    if (!open) return
    setName(room.name)
    setIsPublic(room.is_public)
    setDescription(room.description ?? '')
    setTimezone(room.timezone ?? '')
    setMaxMembers(room.max_members ? String(room.max_members) : '')
    setError('')
  }, [open, room])

  const save = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/rooms/${roomCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorToken,
          name: trimmedName,
          isPublic,
          description: description.trim() || null,
          timezone: timezone || null,
          maxMembers: maxMembers ? Number(maxMembers) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to save settings')
        return
      }
      onUpdated(data.room as RoomApiRow)
      onClose()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Room settings" subtitle="Only the host can change these" size="md">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="label-caps">Room name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            className="input-field w-full"
          />
        </div>

        <div className="space-y-1.5">
          <label className="label-caps">Visibility</label>
          <div className="flex rounded-xl border border-[var(--border)] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsPublic(false)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                !isPublic ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
              }`}
            >
              🔒 Private
            </button>
            <button
              type="button"
              onClick={() => setIsPublic(true)}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                isPublic ? 'bg-[var(--primary)] text-white' : 'text-muted hover:text-body'
              }`}
            >
              🌐 Public
            </button>
          </div>
          <p className="text-xs text-faint">
            {isPublic
              ? 'Anyone can find this room in the public list and join with the code.'
              : 'Only people with the room code can join. Hidden from the public list.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="label-caps">
            Description <span className="normal-case text-faint font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Weekly game night with college friends"
            maxLength={ROOM_DESCRIPTION_MAX}
            rows={3}
            className="input-field w-full resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="label-caps">
            Timezone <span className="normal-case text-faint font-normal">(optional)</span>
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="input-field w-full"
          >
            <option value="">No timezone set</option>
            {timezoneOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-faint">Helps everyone know when you usually play.</p>
        </div>

        <div className="space-y-1.5">
          <label className="label-caps">
            Max members <span className="normal-case text-faint font-normal">(optional)</span>
          </label>
          <input
            value={maxMembers}
            onChange={(e) => setMaxMembers(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="No limit"
            maxLength={3}
            inputMode="numeric"
            className="input-field w-full"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!name.trim() || loading}
            className="btn-primary flex-1"
          >
            {loading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
