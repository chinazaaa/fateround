'use client'

import { PeopleIcon } from '@/components/rooms/icons'
import { useRosterDrawer } from '@/components/roster/RosterDrawerContext'

/**
 * Header affordance that opens the roster drawer — a people icon with the live
 * participant count as a badge. Hides itself when the roster is empty (join
 * screen, finished game), mirroring the mobile `RosterButton`.
 */
export function RosterButton() {
  const ctx = useRosterDrawer()
  if (!ctx || ctx.rows.length === 0) return null

  const count = ctx.participantCount
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(true)}
      aria-label={`Players${count ? ` (${count})` : ''}`}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] text-body transition-colors hover:text-[var(--foreground)] hover:border-[var(--border-strong)]"
    >
      <PeopleIcon size={17} />
      {count > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[var(--background)] bg-[var(--primary)] px-1 text-[10px] font-extrabold leading-none text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </button>
  )
}
