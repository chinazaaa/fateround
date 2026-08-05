'use client'

import { useCallback, useEffect, useState } from 'react'
import { Toggle } from '@/components/ui/PageShell'
import { useTheme } from '@/components/ThemeProvider'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { authHeaders, signOutIdentity } from '@/lib/identity'
import { rememberName } from '@/lib/identity-local'

type Props = {
  profile: {
    handle: string | null
    is_anonymous: boolean
    default_voice_on: boolean | null
    preferred_theme: string | null
  } | null
  onChanged: () => void
}

export function SettingsTab({ profile, onChanged }: Props) {
  const { success, error: toastError } = useToast()
  const { confirm } = useConfirm()
  const { theme: activeTheme, toggle: toggleTheme } = useTheme()

  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [voiceOn, setVoiceOn] = useState(profile?.default_voice_on ?? false)

  useEffect(() => {
    setHandle(profile?.handle ?? '')
    setVoiceOn(profile?.default_voice_on ?? false)
  }, [profile])

  const saveHandle = useCallback(async () => {
    const next = handle.trim()
    if (!next) {
      setMessage('Enter a name.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const headers = await authHeaders()
      if (!headers) {
        setMessage('You are signed out.')
        return
      }
      const res = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ handle: next }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setMessage(json.error ?? 'Could not save your name.')
        return
      }
      rememberName(next)
      onChanged()
      success('Name saved')
    } finally {
      setBusy(false)
    }
  }, [handle, onChanged, success])

  const saveSetting = useCallback(async (key: string, value: unknown) => {
    const headers = await authHeaders()
    if (!headers) return
    await fetch('/api/profile/settings', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ [key]: value }),
    })
  }, [])

  const handleVoiceToggle = (v: boolean) => {
    setVoiceOn(v)
    void saveSetting('default_voice_on', v)
  }

  const handleThemeToggle = () => {
    const next = activeTheme === 'light' ? 'dark' : 'light'
    toggleTheme()
    void saveSetting('preferred_theme', next)
  }

  const handleSignOut = async () => {
    const signedIn = profile && !profile.is_anonymous
    const ok = await confirm({
      title: 'Sign out?',
      message: signedIn
        ? 'You can sign back in any time with your email.'
        : 'This device has no email saved, so this profile and anything on it will be lost for good.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay',
      destructive: true,
    })
    if (!ok) return
    await signOutIdentity()
    onChanged()
    toastError('Signed out')
  }

  const signedIn = Boolean(profile && !profile.is_anonymous)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Display name</h3>
        <div className="flex items-center gap-2">
          <input
            className="input-field max-w-48 text-sm"
            value={handle}
            maxLength={50}
            placeholder="Your name"
            onChange={(e) => setHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && handle.trim() && !busy) void saveHandle()
            }}
          />
          <button
            type="button"
            className="btn-primary btn-fit shrink-0 px-3 py-2 text-sm"
            disabled={busy || !handle.trim() || handle.trim() === (profile?.handle ?? '')}
            onClick={() => void saveHandle()}
          >
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
        <p className="text-faint text-xs">Used when you join or host a game.</p>
        {message ? <p className="text-sm text-red-400">{message}</p> : null}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Preferences</h3>
        <Toggle
          label="Voice chat"
          description="Join voice chat by default when entering a game"
          value={voiceOn}
          onChange={handleVoiceToggle}
        />
        <Toggle
          label="Dark mode"
          description={`Currently ${activeTheme === 'dark' ? 'dark' : 'light'} — tap to switch`}
          value={activeTheme === 'dark'}
          onChange={handleThemeToggle}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Account</h3>
        <div className="surface-inset px-4 py-3">
          <p className="text-sm font-medium">{signedIn ? 'Signed in' : 'Guest'}</p>
          <p className="text-faint mt-0.5 text-xs">
            {signedIn
              ? 'Your streak and trophies follow this account onto any device.'
              : 'Save your profile with an email to keep your progress across devices.'}
          </p>
          <button type="button" className="btn-secondary mt-3 text-sm" onClick={() => void handleSignOut()}>
            {signedIn ? 'Sign out' : 'Switch account'}
          </button>
        </div>
      </div>
    </div>
  )
}
