'use client'

import { useMemo, useState } from 'react'

export interface NamePickerOption {
  id: string
  name: string
  subtitle?: string
}

interface NameSearchPickerProps {
  options: NamePickerOption[]
  valueId: string | null
  onChange: (id: string, name: string) => void
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  listMaxHeight?: string
}

export function NameSearchPicker({
  options,
  valueId,
  onChange,
  searchPlaceholder = 'Search your name…',
  emptyMessage = 'No names match your search',
  disabled = false,
  listMaxHeight = 'max-h-56',
}: NameSearchPickerProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.subtitle?.toLowerCase().includes(q) ?? false)
    )
  }, [options, query])

  const selected = options.find((o) => o.id === valueId)

  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          className="input-field pr-10 disabled:opacity-60"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-white text-sm"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-faint px-0.5">
        <span>{filtered.length === options.length ? `${options.length} names` : `${filtered.length} of ${options.length}`}</span>
        {selected && <span className="text-[var(--primary)] normal-case tracking-normal text-xs">Selected: {selected.name}</span>}
      </div>

      <div
        className="surface-inset border border-white/10 rounded-xl overflow-hidden"
        role="listbox"
        aria-label="Select your name"
      >
        <ul className={`${listMaxHeight} overflow-y-auto overscroll-contain divide-y divide-white/5`}>
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-faint text-sm">{emptyMessage}</li>
          ) : (
            filtered.map((option) => {
              const active = option.id === valueId
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={disabled}
                    onClick={() => onChange(option.id, option.name)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? 'bg-[var(--primary-strong)]/35 text-white'
                        : 'text-white/85 hover:bg-white/5'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${
                        active ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-white/25'
                      }`}
                    >
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-medium">{option.name}</span>
                      {option.subtitle && (
                        <span className="block truncate text-[10px] uppercase tracking-wider text-faint mt-0.5">
                          {option.subtitle}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
