'use client'

import { HostPlayerManageList } from '@/components/host/HostPlayerManageList'
import { EyeIcon, UsersIcon } from '@/components/host/host-icons'
import { seatedParticipantCount } from '@/lib/game-limits'
import type { Player } from '@/types'

type Props = {
  players: Player[]
  removingPlayerId?: string | null
  onRemovePlayer?: (playerId: string, playerName: string) => void
  onAdmitPlayer?: (playerId: string, playerName: string) => void
  admittingPlayerId?: string | null
  canAdmitPlayer?: (playerId: string) => boolean
  highlightPlayerId?: string | null
  label?: string
  emptyMessage?: string
  hint?: string
  /** When set, the count badge reads "N / capacity" instead of just N. */
  capacity?: number
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
  onAdmitPlayer,
  admittingPlayerId,
  canAdmitPlayer,
  highlightPlayerId,
  label = 'Players',
  emptyMessage,
  hint,
  capacity,
  className = '',
  alwaysShowReady,
  tone = 'players',
  children,
}: Props) {
  const Icon = tone === 'viewers' ? EyeIcon : UsersIcon
  // Split the roster into seats vs watchers so the count reads clearly: the "N / max"
  // badge counts only seated players (watchers don't consume a seat), and watchers are
  // surfaced separately instead of inflating the total into a confusing "4 / 2".
  const seatedCount = seatedParticipantCount(players)
  const watcherCount = players.length - seatedCount
  // No open seats → a sitting-out spectator can't ready up, so show "Watching" (not
  // "Not ready") on their row.
  const seatsFull = capacity != null && seatedCount >= capacity

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
        <span className="ml-auto flex items-center gap-1.5">
          <span className="rounded-full bg-[var(--surface-inset-bg)] px-2.5 py-0.5 text-xs font-bold text-body">
            {capacity ? `${seatedCount} / ${capacity}` : players.length}
          </span>
          {watcherCount > 0 ? (
            <span className="rounded-full bg-[var(--surface-inset-bg)] px-2.5 py-0.5 text-xs font-semibold text-faint">
              {watcherCount} watching
            </span>
          ) : null}
        </span>
      </div>
      <HostPlayerManageList
        players={players}
        removingPlayerId={removingPlayerId}
        onRemovePlayer={onRemovePlayer}
        onAdmitPlayer={onAdmitPlayer}
        admittingPlayerId={admittingPlayerId}
        canAdmitPlayer={canAdmitPlayer}
        highlightPlayerId={highlightPlayerId}
        emptyMessage={emptyMessage}
        hint={hint}
        alwaysShowReady={alwaysShowReady}
        seatsFull={seatsFull}
      />
      {children}
    </div>
  )
}
