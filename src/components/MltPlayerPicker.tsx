'use client'

import { useMemo } from 'react'
import { Avatar } from '@/components/Avatar'
import { NameSearchPicker } from '@/components/NameSearchPicker'

export const MLT_PICKER_SEARCH_THRESHOLD = 6

interface MltPlayerOption {
  id: string
  name: string
}

interface MltPlayerPickerProps {
  players: MltPlayerOption[]
  selectedId: string | null
  onSelect: (id: string) => void
  disabled?: boolean
  selfId?: string | null
}

export function MltPlayerPicker({
  players,
  selectedId,
  onSelect,
  disabled = false,
  selfId = null,
}: MltPlayerPickerProps) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [players]
  )

  const displayName = (p: MltPlayerOption) =>
    selfId && p.id === selfId ? `${p.name} (you)` : p.name

  if (sorted.length === 0) {
    return <p className="text-faint text-sm text-center py-4">No players in the game yet</p>
  }

  if (sorted.length > MLT_PICKER_SEARCH_THRESHOLD) {
    return (
      <NameSearchPicker
        options={sorted.map((p) => ({
          id: p.id,
          name: displayName(p),
        }))}
        valueId={selectedId}
        onChange={(id) => !disabled && onSelect(id)}
        searchPlaceholder="Search for someone…"
        emptyMessage="No names match your search"
        disabled={disabled}
        listMaxHeight="max-h-72"
      />
    )
  }

  const scrollable = sorted.length > 4

  return (
    <div
      className={`grid gap-2 ${scrollable ? 'max-h-64 overflow-y-auto overscroll-contain pr-1 -mr-1' : ''}`}
    >
      {sorted.map((p) => {
        const active = selectedId === p.id
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onSelect(p.id)}
            className={`w-full text-left rounded-2xl border px-4 py-3 transition-all active:scale-[0.99] flex items-center gap-3 ${
              active
                ? 'border-amber-400 bg-amber-500/15 text-[var(--foreground)]'
                : 'border-[var(--border-strong)] bg-[var(--card-strong)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--card-hover)]'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <Avatar name={p.name} size="sm" />
            <span className="font-medium truncate">{displayName(p)}</span>
          </button>
        )
      })}
    </div>
  )
}
