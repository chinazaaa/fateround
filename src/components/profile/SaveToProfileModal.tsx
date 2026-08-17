'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { authHeaders, signOutIdentity } from '@/lib/identity'
import { rememberName } from '@/lib/identity-local'
import { requestEmailCode, verifyEmailCode, type EmailCodeFlow } from '@/lib/identity-auth'
import type { Profile } from '@/hooks/useProfile'

type Props = {
  open: boolean
  onClose: () => void
  profile: Profile | null
  /** Re-read the profile after a successful sign-in or a switch. */
  onChanged: () => void
}

/**
 * The one door: email → 8-digit code (`docs/trophies-and-streaks.md` §2.2).
 *
 * LOGIN == SIGNUP. There is no "sign up" vs "log in" choice, because with an email code they
 * are the same action — the backend loads the account if the address is known and creates one
 * if it isn't. The primary button therefore says **"Save to profile"** and never "Sign up":
 * the person acting might be a brand-new guest *or* a returning user who happens to be signed
 * out on this device, and the copy has to be true for both.
 *
 * A code, not a magic link — a link opens the mail app's browser and signs you in *there*,
 * not in the tab you were playing in.
 */
export function SaveToProfileModal({ open, onClose, profile, onChanged }: Props) {
  const { success, error: toastError } = useToast()
  const { confirm } = useConfirm()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [flow, setFlow] = useState<EmailCodeFlow>('signin')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [handle, setHandle] = useState('')

  // Seed the name field whenever the sheet opens on a signed-in profile.
  useEffect(() => {
    if (open) setHandle(profile?.handle ?? '')
  }, [open, profile?.handle])

  const signedIn = Boolean(profile && !profile.is_anonymous)

  // Reset on close so reopening never shows a stale code step or error.
  useEffect(() => {
    if (open) return
    setEmail('')
    setCode('')
    setStep('email')
    setBusy(false)
    setMessage(null)
  }, [open])

  const sendCode = async () => {
    setBusy(true)
    setMessage(null)
    const result = await requestEmailCode(email)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error ?? 'Could not send the code. Try again.')
      return
    }
    // No code was issued because none was needed — the upgrade already landed. Advancing to
    // the code step here would leave the player waiting for an email that never arrives.
    if (result.complete) {
      success('Saved to your profile')
      onChanged()
      onClose()
      return
    }
    // `flow` decides how the code is verified (an in-place upgrade vs a sign-in), so it has to
    // survive from this step to the next.
    setFlow(result.flow)
    setStep('code')
  }

  const submitCode = async () => {
    setBusy(true)
    setMessage(null)
    const result = await verifyEmailCode(email, code, flow)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error ?? 'That code was not right. Try again.')
      return
    }
    success('Saved to your profile')
    onChanged()
    onClose()
  }

  const saveHandle = async () => {
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
      // Mirror immediately so join screens pick it up without waiting for a profile refetch.
      rememberName(next)
      onChanged()
      success('Name saved')
    } finally {
      setBusy(false)
    }
  }

  const switchUser = async () => {
    const ok = await confirm({
      title: 'Switch account?',
      message: signedIn
        ? 'You can sign back in any time with your email.'
        : // The honest warning for a guest: with no email there is no way back.
          'This device has no email saved, so this profile and anything on it will be lost for good.',
      confirmLabel: 'Switch',
      cancelLabel: 'Stay',
      destructive: true,
    })
    if (!ok) return
    await signOutIdentity()
    onChanged()
    onClose()
    toastError('Signed out')
  }

  if (signedIn) {
    return (
      <Modal open={open} onClose={onClose} title="Your profile">
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="modal-display-name" className="text-sm text-muted">
              Your name
            </label>
            <div className="flex items-center gap-2">
              <input
                id="modal-display-name"
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
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
            <p className="text-faint text-xs">Used when you join or host a game.</p>
            {message ? <p className="text-red-400 text-sm">{message}</p> : null}
          </div>

          <div className="space-y-3 border-t border-[var(--border)] pt-4">
            <p className="text-body text-sm">Your streak and trophies follow this account onto any device.</p>
            <Link href="/profile" className="btn-secondary block text-center" onClick={onClose}>
              Your profile
            </Link>
            <Link href="/notifications" className="btn-secondary block text-center" onClick={onClose}>
              🔔 Notification preferences
            </Link>
            <button type="button" className="btn-ghost" onClick={() => void switchUser()}>
              Not you? Switch
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'email' ? 'Save your progress' : 'Enter your code'}
      subtitle={
        step === 'email'
          ? 'Submit your email to save your stats, claim trophies, and track your rank.'
          : `We emailed an 8-digit code to ${email}.`
      }
    >
      <div className="space-y-4">
        {step === 'email' ? (
          <>
            <input
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={email}
              autoComplete="email"
              inputMode="email"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && email.trim() && !busy) void sendCode()
              }}
            />
            {message ? <p className="text-red-400 text-sm">{message}</p> : null}
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !email.trim()}
              onClick={() => void sendCode()}
            >
              {busy ? 'Sending…' : 'Save to profile'}
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              className="input-field"
              placeholder="12345678"
              value={code}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.trim() && !busy) void submitCode()
              }}
            />
            {message ? <p className="text-red-400 text-sm">{message}</p> : null}
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !code.trim()}
              onClick={() => void submitCode()}
            >
              {busy ? 'Checking…' : 'Confirm'}
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setStep('email')}>
              Use a different email
            </button>
          </>
        )}
        {/* Guest-branch entry point to /notifications so users who dismissed
            the home banner still have a way back without signing in. */}
        <div className="pt-3 border-t border-[var(--border)]">
          <Link href="/notifications" className="btn-secondary block text-center" onClick={onClose}>
            🔔 Notification preferences
          </Link>
        </div>
      </div>
    </Modal>
  )
}
