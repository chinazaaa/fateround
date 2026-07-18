'use client'

import { useState } from 'react'
import { MonopolyTokenPicker } from '@/components/monopoly/MonopolyTokenPicker'
import {
  monopolyTokenById,
  monopolyTokenOwners,
  takenMonopolyTokens,
  type MonopolyTokenId,
} from '@/lib/monopoly-tokens'
import { useToast } from '@/components/ui/Toast'
import type { Player } from '@/types'

/**
 * Lets a seated Monopoly player swap their board token from the lobby (before the
 * game starts). Used by both the host lobby (auth via `hostToken`) and the player
 * lobby (auth via `resumeToken`). Own token stays selectable; others' are greyed.
 */
export function MonopolyChangeTokenControl({
  gameCode,
  playerId,
  currentTokenId,
  players,
  resumeToken,
  hostToken,
  onChanged,
}: {
  gameCode: string
  playerId: string
  currentTokenId: string | null | undefined
  players: Player[]
  /** Player self-edit auth. */
  resumeToken?: string | null
  /** Host-edit auth (host changing their own token). */
  hostToken?: string | null
  onChanged: () => void
}) {
  const { success, error } = useToast()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const current = monopolyTokenById(currentTokenId)
  // Exclude self so the host's/player's own token isn't shown as "taken".
  const others = players.filter((p) => p.id !== playerId)
  const taken = takenMonopolyTokens(others)
  const owners = monopolyTokenOwners(others)

  const change = async (tokenId: MonopolyTokenId) => {
    if (tokenId === currentTokenId) {
      setOpen(false)
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/players', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCode,
          playerId,
          monopolyToken: tokenId,
          ...(hostToken ? { hostToken } : { resumeToken }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to change token')
      success('Token updated!')
      setOpen(false)
      onChanged()
    } catch (err) {
      error(err instanceof Error ? err.message : 'Failed to change token')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Your token:{' '}
          <span className="font-bold text-[var(--foreground)]">
            {current ? `${current.emoji} ${current.label}` : '—'}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-sm font-semibold text-[var(--primary)] transition-colors hover:text-[var(--foreground)]"
        >
          {open ? 'Cancel' : 'Change token'}
        </button>
      </div>
      {open && (
        <MonopolyTokenPicker
          selectedTokenId={(currentTokenId as MonopolyTokenId | null) ?? null}
          onSelect={change}
          takenTokenIds={taken}
          tokenOwners={owners}
          disabled={saving}
        />
      )}
    </div>
  )
}
