'use client'

import { MonopolyTokenPicker } from '@/components/monopoly/MonopolyTokenPicker'
import {
  firstAvailableMonopolyToken,
  monopolyTokenById,
  monopolyTokenOwners,
  takenMonopolyTokens,
  type MonopolyTokenId,
} from '@/lib/monopoly-tokens'
import type { Player } from '@/types'
import { useEffect } from 'react'

export function MonopolyJoinForm({
  name,
  onNameChange,
  tokenId,
  onTokenChange,
  players,
  joining,
  joiningAsViewer = false,
  submitLabel = 'Join Estate Kings',
  onSubmit,
}: {
  name: string
  onNameChange: (name: string) => void
  tokenId: MonopolyTokenId | null
  onTokenChange: (tokenId: MonopolyTokenId) => void
  players: Player[]
  joining: boolean
  joiningAsViewer?: boolean
  submitLabel?: string
  onSubmit: () => void
}) {
  const taken = takenMonopolyTokens(players)
  const owners = monopolyTokenOwners(players)
  const selected = monopolyTokenById(tokenId)

  useEffect(() => {
    if (joiningAsViewer) return
    if (tokenId && !takenMonopolyTokens(players).has(tokenId)) return
    const next = firstAvailableMonopolyToken(players)
    if (next && next !== tokenId) onTokenChange(next)
  }, [joiningAsViewer, onTokenChange, players, tokenId])

  const canSubmit = Boolean(name.trim()) && (joiningAsViewer || Boolean(tokenId && !taken.has(tokenId)))

  return (
    <div className="space-y-5">
      {!joiningAsViewer && (
        <section className="rounded-2xl border-2 border-[color-mix(in_srgb,var(--primary)_25%,var(--border-strong))] bg-[var(--surface-inset-bg)] p-4 space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)]">Step 1 · Required</p>
            <h2 className="text-base font-black text-[var(--foreground)] mt-0.5">Pick your board token</h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              Choose the piece that moves around the board. Grey tokens are already taken by someone else.
            </p>
          </div>
          <MonopolyTokenPicker
            selectedTokenId={tokenId}
            onSelect={onTokenChange}
            takenTokenIds={taken}
            tokenOwners={owners}
            disabled={joining}
          />
          {selected && !taken.has(selected.id) && (
            <p className="text-xs text-center text-muted">
              Your token:{' '}
              <span className="font-bold text-[var(--foreground)]">
                {selected.emoji} {selected.label}
              </span>
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        {!joiningAsViewer && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)]">Step 2</p>
        )}
        <label className="label-caps block mb-2" htmlFor="monopoly-join-name">
          Your name
        </label>
        <input
          id="monopoly-join-name"
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && onSubmit()}
          placeholder="Enter your name"
          className="input-field w-full"
          maxLength={40}
          autoComplete="name"
        />
      </section>

      {!joiningAsViewer && name.trim() && !tokenId && (
        <p className="text-sm font-medium text-amber-600 dark:text-amber-400 text-center">
          Pick a board token above before you can join.
        </p>
      )}

      {!joiningAsViewer && tokenId && taken.has(tokenId) && (
        <p className="text-sm font-medium text-red-500 text-center">That token was just taken — please pick another.</p>
      )}

      <button type="button" onClick={onSubmit} disabled={!canSubmit || joining} className="btn-primary w-full">
        {joining ? 'Joining…' : submitLabel}
      </button>
    </div>
  )
}
