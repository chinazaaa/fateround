'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export type SelectOption<TValue extends string | number = string | number> = {
  value: TValue
  label: ReactNode
}

export type CustomSelectProps<TValue extends string | number = string | number> = {
  value: TValue
  onChange: (value: TValue) => void
  options: SelectOption<TValue>[]
  className?: string
  id?: string
  ariaLabel?: string
  searchable?: boolean
  searchPlaceholder?: string
}

function labelToString(label: ReactNode): string {
  if (typeof label === 'string') return label
  if (typeof label === 'number') return String(label)
  return ''
}

export function CustomSelect<TValue extends string | number = string | number>({
  value,
  onChange,
  options,
  className = '',
  id,
  ariaLabel,
  searchable = false,
  searchPlaceholder = 'Search…',
}: CustomSelectProps<TValue>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [search, setSearch] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const generatedId = useId()
  const listboxId = `${id ?? generatedId}-listbox`

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value])
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const filtered = useMemo(() => {
    if (!searchable || !search.trim()) return options.map((o, i) => ({ option: o, originalIndex: i }))
    const q = search.toLowerCase()
    return options
      .map((o, i) => ({ option: o, originalIndex: i }))
      .filter(({ option }) => labelToString(option.label).toLowerCase().includes(q))
  }, [options, search, searchable])

  const openList = useCallback(
    (startIndex: number) => {
      if (options.length === 0) return
      setSearch('')
      setActiveIndex(Math.min(Math.max(startIndex, 0), options.length - 1))
      setOpen(true)
    },
    [options.length]
  )

  useEffect(() => {
    if (open && searchable) {
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open, searchable])

  function closeList(returnFocus: boolean) {
    setOpen(false)
    setActiveIndex(-1)
    setSearch('')
    if (returnFocus) triggerRef.current?.focus()
  }

  function commit(originalIndex: number) {
    const option = options[originalIndex]
    if (!option) return
    onChange(option.value)
    closeList(true)
  }

  function moveActive(nextIndex: number) {
    if (filtered.length === 0) return
    const clamped = (nextIndex + filtered.length) % filtered.length
    setActiveIndex(filtered[clamped]!.originalIndex)
    listboxRef.current
      ?.querySelector(`[data-option-index="${filtered[clamped]!.originalIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  function filteredActivePos(): number {
    return filtered.findIndex((f) => f.originalIndex === activeIndex)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (open) moveActive(filteredActivePos() + 1)
        else openList(selectedIndex >= 0 ? selectedIndex : 0)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (open) moveActive(filteredActivePos() - 1)
        else openList(selectedIndex >= 0 ? selectedIndex : options.length - 1)
        break
      case 'Home':
        if (open) {
          event.preventDefault()
          moveActive(0)
        }
        break
      case 'End':
        if (open) {
          event.preventDefault()
          moveActive(filtered.length - 1)
        }
        break
      case 'Enter':
        event.preventDefault()
        if (open) commit(activeIndex)
        else openList(selectedIndex >= 0 ? selectedIndex : 0)
        break
      case ' ':
        if (!searchable || !open) {
          event.preventDefault()
          if (open) commit(activeIndex)
          else openList(selectedIndex >= 0 ? selectedIndex : 0)
        }
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          closeList(true)
        }
        break
      case 'Tab':
        if (open) closeList(false)
        break
    }
  }

  return (
    <div
      className={`relative w-full ${className}`}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeList(false)
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        onClick={() => (open ? closeList(false) : openList(selectedIndex >= 0 ? selectedIndex : 0))}
        className="input-field flex items-center justify-between gap-2 w-full text-left font-medium cursor-pointer select-none transition-all duration-150"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : String(value)}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-[var(--primary)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M2.75 4.5 6 7.75 9.25 4.5" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 left-0 right-0 top-[calc(100%+0.375rem)] rounded-[0.875rem] border border-[var(--border-strong)] bg-[var(--card-strong)] backdrop-blur-xl shadow-2xl animate-[fade-in_0.15s_ease] flex flex-col"
          style={{ maxHeight: searchable ? '20rem' : '15rem' }}
        >
          {searchable && (
            <div className="px-1.5 pt-1.5 pb-1 shrink-0">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setActiveIndex(-1)
                }}
                placeholder={searchPlaceholder}
                className="w-full px-3 py-2 text-sm rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-[var(--primary)]"
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div ref={listboxRef} role="listbox" id={listboxId} aria-label={ariaLabel} className="overflow-y-auto p-1.5">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-[var(--muted)]">No matches</div>}
            {filtered.map(({ option, originalIndex }) => {
              const isSelected = originalIndex === selectedIndex
              const isActive = originalIndex === activeIndex
              return (
                <div
                  key={String(option.value)}
                  id={`${listboxId}-${originalIndex}`}
                  data-option-index={originalIndex}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(originalIndex)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(originalIndex)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm font-medium text-left cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[var(--primary)]/10 text-[var(--primary-strong)] font-semibold'
                      : 'text-[var(--foreground)]'
                  } ${isActive && !isSelected ? 'bg-[var(--card-hover)] text-[var(--primary-strong)]' : ''}`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 ml-2 text-[var(--primary-strong)]"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
