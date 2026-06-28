'use client'

import { TrashIcon } from '@/components/host/host-icons'
import type { Player } from '@/types'

function initials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function HostPlayerManageList({
  players,
  removingPlayerId,
  onRemovePlayer,
  highlightPlayerId,
  emptyMessage = 'Waiting for players…',
  hint = 'Remove to kick someone out',
  className = '',
  compact = false,
  alwaysShowReady = false,
}: {
  players: Player[]
  removingPlayerId?: string | null
  onRemovePlayer?: (playerId: string, playerName: string) => void
  highlightPlayerId?: string | null
  emptyMessage?: string
  hint?: string
  className?: string
  compact?: boolean
  /** Keep the ✓/✗ ready column visible even when everyone is ready (no spectators). */
  alwaysShowReady?: boolean
}) {
  if (players.length === 0) {
    return <p className="text-muted text-sm">{emptyMessage}</p>
  }

  const showReady = alwaysShowReady || players.some((p) => p.spectator === true)

  // Dense variant (poll host page) — keep it lean, no avatars.
  if (compact) {
    return (
      <div className={`space-y-2 ${className}`}>
        {hint && onRemovePlayer && <p className="text-faint text-xs">{hint}</p>}
        <ul className="space-y-1">
          {players.map((p) => {
            const ready = p.spectator !== true
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-sm truncate min-w-0">{p.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {showReady && (
                    <span className={`text-sm font-bold ${ready ? 'text-emerald-500' : 'text-red-400'}`}>
                      {ready ? '✓' : '✗'}
                    </span>
                  )}
                  {highlightPlayerId === p.id && (
                    <span className="text-[10px] font-bold uppercase text-[var(--primary)]">You</span>
                  )}
                  {onRemovePlayer && (
                    <button
                      type="button"
                      onClick={() => onRemovePlayer(p.id, p.name)}
                      disabled={removingPlayerId === p.id}
                      className="text-faint hover:text-red-400 text-xs disabled:opacity-50 transition-colors"
                    >
                      {removingPlayerId === p.id ? '…' : 'Remove'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {hint && onRemovePlayer && <p className="text-faint text-xs">{hint}</p>}
      <ul className="space-y-1.5">
        {players.map((p) => {
          const ready = p.spectator !== true
          const isYou = highlightPlayerId === p.id
          const removing = removingPlayerId === p.id
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 transition-colors hover:border-[var(--border-strong)]"
            >
              <span className="avatar h-9 w-9 shrink-0 text-sm">{initials(p.name)}</span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{p.name}</p>
                {isYou && <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--primary)]">You</p>}
              </div>

              {showReady && (
                <span
                  className={[
                    'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    ready
                      ? 'bg-[color-mix(in_srgb,#10b981_14%,transparent)] text-emerald-600 dark:text-emerald-300'
                      : 'bg-[var(--surface-inset-bg)] text-faint',
                  ].join(' ')}
                >
                  {ready ? 'Ready' : 'Not ready'}
                </span>
              )}

              {onRemovePlayer && (
                <button
                  type="button"
                  onClick={() => onRemovePlayer(p.id, p.name)}
                  disabled={removing}
                  aria-label={`Remove ${p.name}`}
                  className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-[color-mix(in_srgb,#ef4444_8%,transparent)] hover:text-red-500 disabled:opacity-50"
                >
                  {removing ? <span className="text-xs px-1">…</span> : <TrashIcon size={16} />}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
