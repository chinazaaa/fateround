'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { authHeaders } from '@/lib/identity'
import { validateUsername, normalizeUsername, USERNAME_MAX } from '@/lib/profile/username'

type Props = {
  open: boolean
  onClose: () => void
  /** The player's current username, or null if they haven't claimed one yet. */
  username: string | null
  /** Seed suggestion — their display name, slugified. */
  handle: string | null
  /** Called after a successful claim so the dashboard can refresh. */
  onClaimed: (username: string) => void
}

type Availability = { state: 'idle' | 'checking' | 'ok' | 'bad'; message?: string }

/** Slugify a display name into a starting-point username ('' if nothing usable survives). */
function suggestFrom(handle: string | null): string {
  if (!handle) return ''
  const slug = handle
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, USERNAME_MAX)
  return slug.length >= 3 ? slug : ''
}

/**
 * "Share profile" → claim a username (once) → share the public link.
 *
 * Claiming a username is what makes a profile public, so this modal is where the opt-in happens.
 * If a username already exists we skip straight to the share view.
 */
export function ShareProfileModal({ open, onClose, username, handle, onClaimed }: Props) {
  const [value, setValue] = useState('')
  const [avail, setAvail] = useState<Availability>({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed the input with a suggestion each time the sheet opens without a claimed name.
  useEffect(() => {
    if (open && !username) setValue(suggestFrom(handle))
    if (!open) {
      setAvail({ state: 'idle' })
      setCopied(false)
    }
  }, [open, username, handle])

  const check = useCallback(async (raw: string) => {
    const local = validateUsername(raw)
    if (!local.ok) {
      setAvail({ state: 'bad', message: local.error })
      return
    }
    setAvail({ state: 'checking' })
    try {
      const headers = await authHeaders()
      if (!headers) return setAvail({ state: 'bad', message: 'You are signed out.' })
      const res = await fetch(`/api/profile/username?value=${encodeURIComponent(local.value)}`, { headers })
      const json = await res.json()
      if (json.available) setAvail({ state: 'ok' })
      else setAvail({ state: 'bad', message: json.error ?? 'That username is taken.' })
    } catch {
      setAvail({ state: 'idle' })
    }
  }, [])

  // Debounced availability check as they type.
  useEffect(() => {
    if (username) return
    if (timer.current) clearTimeout(timer.current)
    const raw = value
    if (!raw) return setAvail({ state: 'idle' })
    timer.current = setTimeout(() => void check(raw), 400)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [value, username, check])

  const claim = async () => {
    const local = validateUsername(value)
    if (!local.ok) return setAvail({ state: 'bad', message: local.error })
    setBusy(true)
    try {
      const headers = await authHeaders()
      if (!headers) return setAvail({ state: 'bad', message: 'You are signed out.' })
      const res = await fetch('/api/profile/username', {
        method: 'POST',
        headers,
        body: JSON.stringify({ username: local.value }),
      })
      const json = await res.json()
      if (!res.ok) return setAvail({ state: 'bad', message: json.error ?? 'Could not claim that username.' })
      onClaimed(json.username as string)
    } finally {
      setBusy(false)
    }
  }

  const publicUrl =
    typeof window !== 'undefined' && username ? `${window.location.origin}/u/${username}` : `/u/${username ?? ''}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* ignore */
    }
  }

  // ── Already claimed → share view ─────────────────────────────────────────
  if (username) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Share your profile"
        subtitle="Anyone with the link can see your trophy case."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-inset-bg)] px-3 py-2.5">
            <span className="truncate text-sm text-muted">{publicUrl.replace(/^https?:\/\//, '')}</span>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="btn-secondary btn-fit ml-auto shrink-0 px-3 py-1.5 text-xs"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <Link href={`/u/${username}`} className="btn-primary block text-center" onClick={onClose}>
            Open my public profile
          </Link>
          <p className="text-faint text-xs">
            Your username is <span className="font-semibold">@{username}</span>. It’s how people find your profile.
          </p>
        </div>
      </Modal>
    )
  }

  // ── No username yet → claim view ─────────────────────────────────────────
  const canClaim = avail.state === 'ok' && !busy
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Claim your username"
      subtitle="Pick a unique username for your shareable profile link. You can keep the name you already play with, if it’s free."
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="text-muted">Username</span>
          <div className="mt-1 flex items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3">
            <span className="text-faint select-none text-sm">/u/</span>
            <input
              className="w-full bg-transparent py-2.5 text-sm outline-none"
              value={value}
              maxLength={USERNAME_MAX}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="yourname"
              onChange={(e) => setValue(normalizeUsername(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canClaim) void claim()
              }}
            />
          </div>
        </label>

        <p className="min-h-[1.25rem] text-xs">
          {avail.state === 'checking' && <span className="text-faint">Checking…</span>}
          {avail.state === 'ok' && <span className="text-green-500">@{value} is available</span>}
          {avail.state === 'bad' && <span className="text-red-400">{avail.message}</span>}
        </p>

        <button type="button" className="btn-primary" disabled={!canClaim} onClick={() => void claim()}>
          {busy ? 'Claiming…' : 'Claim & share'}
        </button>
        <p className="text-faint text-xs">
          Letters, numbers and underscores. This is separate from your display name — claiming it makes your trophy case
          public.
        </p>
      </div>
    </Modal>
  )
}
