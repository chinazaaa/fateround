'use client'

import { HostPlayerManageList } from '@/components/host/HostPlayerManageList'
import { EyeIcon, UsersIcon } from '@/components/host/host-icons'
import type { Player } from '@/types'

type Props = {
  players: Player[]
  removingPlayerId?: string | null
  onRemovePlayer?: (playerId: string, playerName: string) => void
  highlightPlayerId?: string | null
  label?: string
  emptyMessage?: string
  hint?: string
  className?: string
  alwaysShowReady?: boolean
  /** 'viewers' tints the header icon and uses an eye glyph. */
  tone?: 'players' | 'viewers'
  children?: React.ReactNode
}

export function HostLobbyPlayersSection({
  players,
  removingPlayerId,
  onRemovePlayer,
  highlightPlayerId,
  label = 'Players',
  emptyMessage,
  hint,
  className = '',
  alwaysShowReady,
  tone = 'players',
  children,
}: Props) {
  const Icon = tone === 'viewers' ? EyeIcon : UsersIcon

  return (
    <div
      className={[
        'rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))]',
        'bg-[var(--card-strong)]/95 p-5 space-y-3',
        className,
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
          <Icon size={15} />
        </span>
        <p className="label-caps !text-[var(--muted)]">{label}</p>
        <span className="ml-auto rounded-full bg-[var(--surface-inset-bg)] px-2.5 py-0.5 text-xs font-bold text-body">
          {players.length}
        </span>
      </div>
      <HostPlayerManageList
        players={players}
        removingPlayerId={removingPlayerId}
        onRemovePlayer={onRemovePlayer}
        highlightPlayerId={highlightPlayerId}
        emptyMessage={emptyMessage}
        hint={hint}
        alwaysShowReady={alwaysShowReady}
      />
      {children}
    </div>
  )
}
