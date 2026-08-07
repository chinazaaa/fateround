'use client'

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

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
}

export function CustomSelect<TValue extends string | number = string | number>({
  value,
  onChange,
  options,
  className = '',
  id,
  ariaLabel,
}: CustomSelectProps<TValue>) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxRef = useRef<HTMLDivElement>(null)
  const generatedId = useId()
  const listboxId = `${id ?? generatedId}-listbox`

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value])
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined

  function openList(startIndex: number) {
    if (options.length === 0) return
    setActiveIndex(Math.min(Math.max(startIndex, 0), options.length - 1))
    setOpen(true)
  }

  function closeList(returnFocus: boolean) {
    setOpen(false)
    setActiveIndex(-1)
    if (returnFocus) triggerRef.current?.focus()
  }

  function commit(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    closeList(true)
  }

  function moveActive(nextIndex: number) {
    if (options.length === 0) return
    const clamped = (nextIndex + options.length) % options.length
    setActiveIndex(clamped)
    listboxRef.current?.querySelector(`[data-option-index="${clamped}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (open) moveActive(activeIndex + 1)
        else openList(selectedIndex >= 0 ? selectedIndex : 0)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (open) moveActive(activeIndex - 1)
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
          moveActive(options.length - 1)
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (open) commit(activeIndex)
        else openList(selectedIndex >= 0 ? selectedIndex : 0)
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
          ref={listboxRef}
          role="listbox"
          id={listboxId}
          aria-label={ariaLabel}
          className="absolute z-50 left-0 right-0 top-[calc(100%+0.375rem)] max-h-60 overflow-y-auto rounded-[0.875rem] border border-[var(--border-strong)] bg-[var(--card-strong)] backdrop-blur-xl p-1.5 shadow-2xl animate-[fade-in_0.15s_ease]"
        >
          {options.map((option, index) => {
            const isSelected = index === selectedIndex
            const isActive = index === activeIndex
            return (
              <div
                key={String(option.value)}
                id={`${listboxId}-${index}`}
                data-option-index={index}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
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
      )}
    </div>
  )
}
