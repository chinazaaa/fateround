'use client'

import { useEffect, useState } from 'react'
import { useProfile } from '@/hooks/useProfile'
import { useToast } from '@/components/ui/Toast'
import { authHeaders } from '@/lib/identity'
import { rememberName } from '@/lib/identity-local'

const PERSONALIZED_KEY = 'daily-name-personalized'

/**
 * Finish-screen nudge to personalize the auto-assigned display name (e.g. "SwiftFalcon12") so the
 * leaderboard shows a real name. Anonymous-friendly — it just PATCHes the handle, no sign-in. First
 * time it shows expanded ("make it yours"); after the player has set a name once, it collapses to a
 * subtle "Playing as X · Edit".
 */
export function DailyNamePrompt() {
  const { profile, refresh } = useProfile()
  const { success } = useToast()

  const [personalized, setPersonalized] = useState(true) // assume until we read localStorage
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPersonalized(typeof window !== 'undefined' && window.localStorage.getItem(PERSONALIZED_KEY) === '1')
  }, [])

  useEffect(() => {
    if (profile?.handle) setName(profile.handle)
  }, [profile?.handle])

  // No identity yet (guest who somehow reached results without a profile) — nothing to rename.
  if (!profile) return null

  const save = async () => {
    const next = name.trim()
    if (!next || next === profile.handle) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      const headers = await authHeaders()
      if (!headers) return
      const res = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ handle: next }),
      })
      if (!res.ok) return
      rememberName(next)
      window.localStorage.setItem(PERSONALIZED_KEY, '1')
      setPersonalized(true)
      setEditing(false)
      refresh()
      success('Name saved')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <div className="fr-card !p-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="input-field flex-1"
          value={name}
          maxLength={50}
          autoFocus
          placeholder="What should we call you?"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) void save()
          }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="fr-btn fr-btn--primary"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="fr-btn fr-btn--ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Already personalized → subtle line. Otherwise → a clear nudge.
  if (personalized) {
    return (
      <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
        Playing as <strong>{profile.handle}</strong> ·{' '}
        <button type="button" className="underline" onClick={() => setEditing(true)}>
          Edit
        </button>
      </p>
    )
  }

  return (
    <div className="fr-card !p-4 text-center">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        You&apos;re on the board as <strong>{profile.handle}</strong>
      </p>
      <button type="button" className="fr-btn fr-btn--secondary fr-btn--sm mt-2" onClick={() => setEditing(true)}>
        Make it yours
      </button>
    </div>
  )
}
