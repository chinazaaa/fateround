'use client'

import { useState } from 'react'
import { ChevronRightIcon, SlidersIcon } from '@/components/host/host-icons'

type Props = {
  title?: string
  summary?: string
  status?: string | null
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

export function HostLobbySettingsSection({
  title = 'Before you start',
  summary,
  status,
  defaultOpen = false,
  children,
  className = '',
}: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div
      className={[
        'rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))]',
        'bg-[var(--card-strong)]/95 overflow-hidden',
        className,
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-4 py-4 flex items-center gap-3 text-left transition-colors hover:bg-[var(--card-hover)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
          <SlidersIcon size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold leading-tight">{title}</p>
            {status ? (
              <span
                className={[
                  'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full',
                  status === 'Saved'
                    ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10'
                    : 'text-muted bg-[var(--surface-inset-bg)]',
                ].join(' ')}
              >
                {status}
              </span>
            ) : null}
          </div>
          {summary ? (
            <p className={`text-faint text-xs mt-0.5 leading-snug ${open ? '' : 'truncate'}`}>{summary}</p>
          ) : null}
        </div>

        <span
          className={[
            'shrink-0 flex items-center gap-1 text-xs font-semibold transition-colors',
            open ? 'text-muted' : 'text-[var(--primary-strong)]',
          ].join(' ')}
        >
          {open ? 'Done' : 'Edit'}
          <ChevronRightIcon size={15} className={`transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
        </span>
      </button>

      {open ? (
        <div className="px-4 pb-4 pt-1 border-t border-[color-mix(in_srgb,var(--primary)_10%,var(--border))] space-y-4 divide-y divide-[color-mix(in_srgb,var(--primary)_8%,var(--border))] [&>section:not(:first-child)]:pt-4 [&>*:not(:first-child):not(section)]:pt-4">
          {children}
        </div>
      ) : null}
    </div>
  )
}
