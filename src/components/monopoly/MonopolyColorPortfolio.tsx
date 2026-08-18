'use client'

import { MONOPOLY_COLOR_CLASSES } from '@/lib/monopoly'
import type { MonopolyBoardSize, MonopolyColorGroup } from '@/lib/monopoly-board'
import { buildColorGroupStatuses, COLOR_SET_ORDER, type ColorGroupStatus } from '@/lib/monopoly-color-portfolio'
import { themedSpaceName } from '@/components/monopoly/monopoly-themes'
import type { Player } from '@/types'

function colorBarClass(color: MonopolyColorGroup): string {
  return MONOPOLY_COLOR_CLASSES[color] ?? 'bg-neutral-500'
}

function ColorSetRow({
  status,
  themeId,
  boardSize = 40,
}: {
  status: ColorGroupStatus
  themeId?: string | null
  boardSize?: MonopolyBoardSize
}) {
  const { group, label, owned, total, complete, missing } = status
  const inactive = owned === 0

  return (
    <div
      className={[
        'rounded-xl border overflow-hidden',
        inactive
          ? 'border-[var(--border-strong)] opacity-55'
          : complete
            ? 'border-[color-mix(in_srgb,var(--primary)_40%,var(--border-strong))]'
            : 'border-[var(--border-strong)]',
      ].join(' ')}
    >
      <div className={['h-2 w-full', colorBarClass(group)].join(' ')} />
      <div className="px-3 py-2 space-y-1 bg-[var(--surface-inset-bg)]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-[var(--foreground)]">{label}</span>
          <span className="text-xs font-semibold tabular-nums shrink-0">
            {owned}/{total}
            {complete && (
              <span className="ml-1.5 text-[var(--primary)]" title="Full colour set">
                ✓
              </span>
            )}
          </span>
        </div>
        {!inactive && missing.length > 0 && (
          <p className="text-[10px] text-muted leading-relaxed">
            Need:{' '}
            {missing.map((m, i) => (
              <span key={m.name}>
                {i > 0 ? ', ' : ''}
                <span className="text-body">{themedSpaceName(m.name, m.index, themeId, boardSize)}</span>
                {m.heldBy === 'other' && m.ownerName ? (
                  <span className="text-faint"> ({m.ownerName})</span>
                ) : (
                  <span className="text-faint"> (bank)</span>
                )}
              </span>
            ))}
          </p>
        )}
        {inactive && <p className="text-[10px] text-faint">None owned yet</p>}
      </div>
    </div>
  )
}

export function MonopolyColorPortfolio({
  propertyOwners,
  myPlayerId,
  players,
  themeId,
  boardSize = 40,
}: {
  propertyOwners: Record<string, string>
  myPlayerId: string
  players: Player[]
  themeId?: string | null
  boardSize?: MonopolyBoardSize
}) {
  const playerNames = new Map(players.map((p) => [p.id, p.name]))
  const statuses = buildColorGroupStatuses(propertyOwners, myPlayerId, playerNames, boardSize)
  const streetSets = statuses.filter((s) => s.group !== 'station' && s.group !== 'utility')
  const specialSets = statuses.filter((s) => s.group === 'station' || s.group === 'utility')
  const ownedSetCount = streetSets.filter((s) => s.complete).length
  const partialCount = streetSets.filter((s) => s.owned > 0 && !s.complete).length

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-caps">Colour sets</p>
        <p className="text-[10px] text-muted">
          {ownedSetCount} complete
          {partialCount > 0 ? ` · ${partialCount} in progress` : ''}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {streetSets.map((status) => (
          <ColorSetRow key={status.group} status={status} themeId={themeId} boardSize={boardSize} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 pt-1">
        {specialSets.map((status) => (
          <ColorSetRow key={status.group} status={status} themeId={themeId} boardSize={boardSize} />
        ))}
      </div>
    </div>
  )
}

export function MonopolyColorBar({ color }: { color: MonopolyColorGroup }) {
  return <div className={['h-1.5 w-full rounded-full', colorBarClass(color)].join(' ')} />
}

/** Dot strip showing owned (filled) vs missing slots in a group. */
export function MonopolyColorSetDots({ status }: { status: ColorGroupStatus }) {
  return (
    <div className="flex gap-1 items-center" title={`${status.owned}/${status.total} in ${status.label}`}>
      {Array.from({ length: status.total }, (_, i) => (
        <span
          key={i}
          className={[
            'h-2.5 w-2.5 rounded-full border',
            i < status.owned
              ? [colorBarClass(status.group), 'border-transparent'].join(' ')
              : 'border-[var(--border-strong)] bg-transparent',
          ].join(' ')}
        />
      ))}
    </div>
  )
}

export { COLOR_SET_ORDER, colorBarClass }
