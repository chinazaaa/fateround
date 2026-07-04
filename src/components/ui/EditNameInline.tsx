'use client'

import { useState } from 'react'
import { getPlayerSession, setPlayerSession } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

export function EditNameInline({
  gameCode,
  playerId,
  currentName,
  onRenamed,
  spectating = false,
}: {
  gameCode: string
  playerId: string
  currentName: string
  onRenamed: (newName: string) => void
  /** Show a "Watching as" label instead of "Playing as" for spectators/viewers. */
  spectating?: boolean
}) {
  const { success, error: toastError } = useToast()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(currentName)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === currentName) {
      setEditing(false)
      return
    }
    const existing = getPlayerSession(gameCode)
    const resumeToken = existing?.resumeToken
    if (!resumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/players', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerId, playerName: trimmed, resumeToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update name')
      setPlayerSession(gameCode, playerId, data.playerName, existing?.playerGender ?? 'both', existing?.resumeToken)
      onRenamed(data.playerName)
      setName(data.playerName)
      setEditing(false)
      success('Name updated!')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update name')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <p className="text-muted text-sm">
        {spectating ? 'Watching as' : 'Playing as'} <strong>{currentName}</strong>{' '}
        <button
          type="button"
          onClick={() => {
            setName(currentName)
            setEditing(true)
          }}
          className="text-xs underline text-faint hover:text-[var(--foreground)] transition-colors"
        >
          Edit
        </button>
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="input-field flex-1 py-1 text-sm"
        maxLength={40}
        autoFocus
      />
      <button
        type="button"
        onClick={save}
        disabled={saving || !name.trim()}
        className="btn-primary btn-fit px-3 py-1.5 text-xs whitespace-nowrap"
      >
        {saving ? '…' : 'Save'}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="btn-secondary btn-fit px-3 py-1.5 text-xs">
        Cancel
      </button>
    </div>
  )
}
