'use client'

import { useState } from 'react'
import { InviteLinkActions } from '@/components/InviteLinkActions'
import { playerResumeUrl, shareOrigin } from '@/lib/site'
import { getPlayerSession } from '@/lib/utils'

export function PlayerResumeCard({
  gameCode,
  resumeToken: resumeTokenProp,
  className = '',
  compact = false,
}: {
  gameCode: string
  resumeToken?: string | null
  className?: string
  compact?: boolean
}) {
  const resumeToken = resumeTokenProp ?? getPlayerSession(gameCode)?.resumeToken ?? null
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState(false)

  if (!resumeToken) return null

  const url = playerResumeUrl(gameCode, resumeToken, shareOrigin())

  if (compact) {
    return (
      <p className={`text-faint text-xs ${className}`}>
        <span className="uppercase tracking-wider text-[10px]">Player code</span>{' '}
        <span className="font-mono font-semibold tracking-[0.15em] text-muted">{resumeToken}</span>
      </p>
    )
  }

  // Collapsed by default in the lobby — the code + link only matter if you're switching
  // devices, so keep it out of the way until tapped.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className={`group flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] hover:bg-[var(--surface-inset-bg)] ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-inset-bg)] text-sm"
          >
            📱
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-sm font-semibold text-body">Continue on another device</span>
            <span className="block text-xs text-faint">Get a code to switch phone or laptop</span>
          </span>
        </span>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5"
        >
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    )
  }

  return (
    <div className={`glass-card p-4 space-y-3 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-muted text-xs uppercase tracking-wider">Continue on another device</p>
          <p className="text-faint text-xs">Save this code or link to pick up where you left off.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-faint text-xs hover:text-body transition-colors"
        >
          Hide
        </button>
      </div>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left"
      >
        <p className="text-faint text-[10px] uppercase tracking-wider">Your player code</p>
        <p className="font-mono font-bold text-xl tracking-[0.2em] mt-1">{revealed ? resumeToken : '••••••'}</p>
        <p className="text-faint text-xs mt-1">{revealed ? 'Tap to hide' : 'Tap to reveal'}</p>
      </button>
      <p className="text-body font-mono text-sm break-all">{url}</p>
      <InviteLinkActions url={url} copyLabel="Copy continue link" successMessage="Continue link copied" />
    </div>
  )
}
