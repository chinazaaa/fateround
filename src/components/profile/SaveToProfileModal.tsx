'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { signOutIdentity } from '@/lib/identity'
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
 * The one door: email → 6-digit code (`docs/trophies-and-streaks.md` §2.2).
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
        <div className="space-y-6">
          <p className="text-body">
            Signed in as <strong>{profile?.handle || 'you'}</strong>. Your streak and trophies follow this account onto
            any device.
          </p>
          <button type="button" className="btn-secondary" onClick={() => void switchUser()}>
            Not you? Switch
          </button>
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
          ? "New here? We'll create your profile. Been here before? We'll load your trophies."
          : `We emailed a 6-digit code to ${email}.`
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
              placeholder="123456"
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
      </div>
    </Modal>
  )
}
