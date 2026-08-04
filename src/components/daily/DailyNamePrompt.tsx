'use client'

import { useEffect, useState } from 'react'
import { useProfile } from '@/hooks/useProfile'
import { useToast } from '@/components/ui/Toast'
import { authHeaders } from '@/lib/identity'
import { rememberName } from '@/lib/identity-local'

/**
 * Finish-screen name control. Players who still have the AUTO-assigned name (handle_is_auto) get a
 * clear "make it yours" nudge; players who've already chosen a name just see a subtle "Playing as
 * X · Edit". Anonymous-friendly — it PATCHes the handle, no sign-in. Setting a name clears
 * handle_is_auto server-side, so the nudge never reappears (across devices too).
 */
export function DailyNamePrompt() {
  const { profile, refresh } = useProfile()
  const { success } = useToast()

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile?.handle) setName(profile.handle)
  }, [profile?.handle])

  // No identity yet (guest who somehow reached results without a profile) — nothing to rename.
  if (!profile) return null

  const isAuto = profile.handle_is_auto

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
      setEditing(false)
      refresh() // re-reads profile with handle_is_auto now false → nudge collapses to subtle line
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

  // Chosen name → subtle line. Still on the auto name → a clear nudge.
  if (!isAuto) {
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
