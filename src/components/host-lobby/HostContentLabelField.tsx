'use client'

import { useEffect, useRef, useState } from 'react'
import { Field } from '@/components/ui/PageShell'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

/**
 * Host-lobby editor for a game's player-facing content label ("Maths", "Bible trivia").
 * The counterpart to the "Category" field on the create screen, so the host can add or
 * fix it after the fact — it shows next to the room name on the join, gameplay, and
 * finished screens.
 *
 * Self-contained: holds local state and PATCHes the general game settings route on blur
 * (mirrors {@link HostVisibilityToggle}). Only meaningful for CSV/library content games,
 * so callers gate on game type before rendering it.
 */
export function HostContentLabelField({
  gameCode,
  hostToken,
  game,
  onGameUpdate,
}: {
  gameCode: string
  hostToken: string
  game: Game
  onGameUpdate?: (game: Game) => void
}) {
  const { error: toastError } = useToast()
  const [value, setValue] = useState(game.content_label ?? '')
  const [saving, setSaving] = useState(false)
  const savedRef = useRef(game.content_label ?? '')

  // Keep in sync with the game row (realtime / another device) unless the host is mid-edit.
  useEffect(() => {
    const remote = game.content_label ?? ''
    if (remote !== savedRef.current) {
      savedRef.current = remote
      setValue(remote)
    }
  }, [game.content_label])

  const save = async () => {
    const next = value.trim().slice(0, 40)
    if (next === savedRef.current.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, content_label: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update category')
      savedRef.current = next
      if (data.game) onGameUpdate?.(data.game)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Field label="Category">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        placeholder="e.g. Maths, Bible, 90s Music"
        maxLength={40}
        disabled={saving}
        className="input-field"
      />
      <p className="text-faint text-xs mt-2">Shown to players next to the room name, before they join.</p>
    </Field>
  )
}
