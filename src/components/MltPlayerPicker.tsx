'use client'

import { useMemo } from 'react'
import { getInitial } from '@/lib/utils'
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
}

export function MltPlayerPicker({
  players,
  selectedId,
  onSelect,
  disabled = false,
}: MltPlayerPickerProps) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [players]
  )

  if (sorted.length === 0) {
    return <p className="text-faint text-sm text-center py-4">No one else to vote for yet</p>
  }

  if (sorted.length > MLT_PICKER_SEARCH_THRESHOLD) {
    return (
      <NameSearchPicker
        options={sorted}
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
                ? 'border-amber-400 bg-amber-500/15 text-amber-100'
                : 'border-white/10 surface-inset text-white/85 hover:border-white/25'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <div className="avatar w-8 h-8 text-sm shrink-0">{getInitial(p.name)}</div>
            <span className="font-medium truncate">{p.name}</span>
          </button>
        )
      })}
    </div>
  )
}
