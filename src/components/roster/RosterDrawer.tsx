'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRosterDrawer, type RosterRow } from '@/components/roster/RosterDrawerContext'

/**
 * Right-side slide-in drawer holding the unified roster (seat · name · score ·
 * status). Web port of the mobile `RosterDrawer` — rendered once at the layout
 * level so it paints above the game body and the fixed chrome. Opened by the
 * header {@link import('./RosterButton').RosterButton}.
 */
export function RosterDrawer() {
  const ctx = useRosterDrawer()
  const [portalReady, setPortalReady] = useState(false)
  // Stay mounted through the slide-out transition, then unmount.
  const open = !!ctx?.open
  const [mounted, setMounted] = useState(open)
  // Drives the enter/exit transform — flipped to true one frame after mount.
  const [shown, setShown] = useState(false)

  useEffect(() => setPortalReady(true), [])

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Next frame: let the closed transform paint first so the transition runs.
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 220)
    return () => clearTimeout(t)
  }, [open])

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ctx?.setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, ctx])

  if (!ctx || !portalReady || !mounted) return null

  const close = () => ctx.setOpen(false)
  const watching = ctx.rows.length - ctx.participantCount
  const headerLabel =
    watching > 0 ? `${ctx.participantCount} playing · ${watching} watching` : `Players · ${ctx.participantCount}`
  // When any row carries a numeric score the drawer is a live leaderboard, so the
  // leading number should be rank (position in the score-sorted list).
  const ranked = ctx.rows.some((r) => typeof r.score === 'number')

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Players">
      <div
        onClick={close}
        aria-hidden
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-[85vw] max-w-[380px] flex-col border-l border-[var(--border)] bg-[var(--background)] shadow-2xl transition-transform duration-200 ease-out ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">{headerLabel}</p>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:text-[var(--foreground)]"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {ctx.rows.map((row, index) => (
            <RosterRowView
              key={row.id}
              row={row}
              // Rows are already sorted by score (desc) then seat, so when the game
              // has a leaderboard the leading number reads as rank; otherwise it
              // falls back to the join-order seat.
              number={ranked ? index + 1 : row.seat}
              // The host's own client knows its host player id (via the manage
              // config it registers); other clients rely on `row.host` once it's
              // wired from game data. Either marks the row with a HOST pill.
              isHost={row.host || (!!ctx.manage?.hostPlayerId && row.id === ctx.manage.hostPlayerId)}
              onRemove={
                ctx.manage && !row.isMe && row.id !== ctx.manage.hostPlayerId
                  ? () => ctx.manage?.onRemove(row)
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

/** 1 = 🥇 Winner, 2 = 🥈 Runner-up, 3 = 🥉 3rd, else Nth. Null for unplaced. */
function placementLabel(place: number | undefined): string | null {
  if (place == null) return null
  if (place === 1) return '🥇 Winner'
  if (place === 2) return '🥈 Runner-up'
  if (place === 3) return '🥉 3rd'
  return `${place}th`
}

function RosterRowView({
  row,
  number,
  isHost = false,
  onRemove,
}: {
  row: RosterRow
  number: number
  isHost?: boolean
  onRemove?: () => void
}) {
  const scoreText =
    row.score === null || row.score === undefined
      ? null
      : typeof row.score === 'number'
        ? `${row.score}${row.scoreSuffix ?? ''}`
        : row.score
  const statusText = row.eliminated ? 'Out' : row.viewer ? 'Watching' : (row.status ?? null)
  const placeLabel = placementLabel(row.placement)

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 ${
        row.isMe ? 'bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]' : ''
      }`}
    >
      <span className="w-5 shrink-0 text-center text-[13px] font-bold text-faint">{number}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-body">
          <span className="truncate">{row.name}</span>
          {isHost ? (
            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-[var(--primary)]">
              Host
            </span>
          ) : null}
          {placeLabel ? (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                row.placement === 1
                  ? 'bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]'
                  : 'bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] text-muted'
              }`}
            >
              {placeLabel}
            </span>
          ) : null}
          {row.isMe ? <span className="shrink-0 text-xs font-bold text-faint">· you</span> : null}
        </p>
        {statusText ? <p className="text-[11px] font-semibold text-faint">{statusText}</p> : null}
      </div>
      {scoreText != null ? <span className="shrink-0 text-sm font-bold text-[var(--primary)]">{scoreText}</span> : null}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${row.name}`}
          className="shrink-0 text-[13px] font-bold text-[var(--danger)] transition-opacity hover:opacity-80"
        >
          Remove
        </button>
      ) : null}
    </div>
  )
}
