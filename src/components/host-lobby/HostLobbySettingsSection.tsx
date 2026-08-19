'use client'

import { useState } from 'react'
import { Glyph } from '@/components/icons/Glyph'
import { Settings01Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons'

type Props = {
  title?: string
  status?: string | null
  defaultOpen?: boolean
  alwaysVisible?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function HostLobbySettingsSection({
  title = 'Before you start',
  status,
  defaultOpen = false,
  alwaysVisible,
  children,
  className = '',
}: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const collapsible = children != null
  const headerClassName = 'w-full px-4 py-3.5 flex items-center gap-3 text-left transition-colors cursor-pointer'

  const headerContent = (
    <>
      <span className="fr-glyph flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary)]">
        <Glyph icon={Settings01Icon} size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text)' }}>
            {title}
          </p>
          {status ? (
            <span
              className={[
                'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                status === 'Saved' ? 'text-emerald-600 bg-emerald-500/10' : 'text-muted bg-[var(--surface-inset-bg)]',
              ].join(' ')}
            >
              {status}
            </span>
          ) : null}
        </div>
      </div>

      {collapsible ? (
        <span
          className={[
            'shrink-0 flex items-center gap-1 text-xs font-bold transition-colors text-[var(--primary)]',
          ].join(' ')}
        >
          {open ? 'Collapse' : 'Expand'}
          <span className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            <Glyph icon={ArrowDown01Icon} size={14} />
          </span>
        </span>
      ) : null}
    </>
  )

  return (
    <div
      className={[
        'rounded-2xl border border-[color-mix(in_srgb,var(--primary)_14%,var(--border))]',
        'bg-[var(--card-strong)] overflow-hidden',
        className,
      ].join(' ')}
    >
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`${headerClassName} hover:bg-[var(--card-hover)]`}
        >
          {headerContent}
        </button>
      ) : (
        <div className={headerClassName}>{headerContent}</div>
      )}

      {alwaysVisible ? (
        <div className="px-4 pb-4 pt-1 border-t border-[color-mix(in_srgb,var(--primary)_10%,var(--border))]">
          {alwaysVisible}
        </div>
      ) : null}

      {collapsible && open ? (
        <div className="px-4 pb-4 pt-1 border-t border-[color-mix(in_srgb,var(--primary)_10%,var(--border))] space-y-4 divide-y divide-[color-mix(in_srgb,var(--primary)_8%,var(--border))] [&>section:not(:first-child)]:pt-4 [&>*:not(:first-child):not(section)]:pt-4">
          {children}
        </div>
      ) : null}
    </div>
  )
}
