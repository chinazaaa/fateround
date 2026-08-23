/**
 * Mobile mirror of `src/lib/identity-auth.ts` — attaching an email to an identity so it
 * survives a new device (`docs/accounts-and-identity-plan.md` §5, Slice 3/4).
 *
 * LOGIN == SIGNUP: one email field, one 8-digit code, and the backend decides whether that is
 * a sign-in or a new account. UI copy says "Save to profile", never "Sign up".
 *
 * MOBILE SELLS NOTHING. This exists purely so a plan bought on the web is recognised here, and
 * so a returning player can load their streak onto a new phone. No purchase UI, and per
 * Apple/Google rules not even a link out to a paywall.
 */
import { getSupabase } from '@/lib/supabase'

/** Which Supabase verification the code belongs to — the two cases need different types. */
export type EmailCodeFlow = 'upgrade' | 'signin'

export type RequestCodeResult = {
  ok: boolean
  flow: EmailCodeFlow
  error?: string
  /**
   * True when the upgrade already finished and there is no code to enter — Supabase only issues
   * one when "Confirm email" is enabled. Without this the user waits for a mail that never comes.
   */
  complete?: boolean
}
export type VerifyCodeResult = { ok: boolean; error?: string }

const GENERIC_ERROR = "That didn't work. Check the address and try again."

/**
 * True when the failure means "this email already belongs to an account" (→ Case B).
 *
 * Prefers Supabase's stable error `code` and falls back to matching the message, which is
 * human-facing text that can change between releases. Getting this wrong is not cosmetic: a
 * false negative surfaces a dead-end error to a returning user instead of signing them in.
 */
function isEmailTaken(error: { message: string; code?: string }): boolean {
  if (error.code && /email_exists|email_address_taken|user_already_exists/i.test(error.code)) return true
  return /already|registered|exists|taken/i.test(error.message)
}

/** Send an 8-digit code. The returned `flow` must be passed to {@link verifyEmailCode}. */
export async function requestEmailCode(email: string): Promise<RequestCodeResult> {
  const address = email.trim().toLowerCase()
  if (!address) return { ok: false, flow: 'signin', error: 'Enter your email address' }

  try {
    const supabase = getSupabase()
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user

    // Case A first — upgrading in place keeps the same auth.uid(), so nothing is lost.
    if (user?.is_anonymous) {
      const { data: updated, error } = await supabase.auth.updateUser({ email: address })
      if (!error) {
        const applied = updated.user?.email?.toLowerCase() === address && !updated.user?.new_email
        if (applied) {
          {
            const { getDeviceId } = await import('@/lib/coins/device-id')
            const deviceId = await getDeviceId()
            await postWithSession('/api/profile/anon', deviceId ? { deviceId } : undefined)
          }
          return { ok: true, flow: 'upgrade', complete: true }
        }
        return { ok: true, flow: 'upgrade' }
      }
      if (!isEmailTaken(error)) return { ok: false, flow: 'upgrade', error: error.message || GENERIC_ERROR }
    }

    const { error } = await supabase.auth.signInWithOtp({ email: address })
    if (error) return { ok: false, flow: 'signin', error: error.message || GENERIC_ERROR }
    return { ok: true, flow: 'signin' }
  } catch {
    return { ok: false, flow: 'signin', error: GENERIC_ERROR }
  }
}

/** Verify the code and establish the permanent session. */
export async function verifyEmailCode(email: string, code: string, flow: EmailCodeFlow): Promise<VerifyCodeResult> {
  const address = email.trim().toLowerCase()
  const token = code.trim()
  if (!token) return { ok: false, error: 'Enter the code we emailed you' }

  try {
    const supabase = getSupabase()
    // Capture the outgoing identity before verifying — in Case B this token is the only proof
    // that the anonymous identity was ours (the merge endpoint refuses a bare profile id).
    const { data: before } = await supabase.auth.getSession()
    const previousUserId = before.session?.user?.id ?? null
    const previousToken = before.session?.access_token ?? null

    const { data, error } = await supabase.auth.verifyOtp({
      email: address,
      token,
      // 'email_change' completes an updateUser({ email }); 'email' completes a signInWithOtp.
      type: flow === 'upgrade' ? 'email_change' : 'email',
    })
    if (error) return { ok: false, error: error.message || 'That code was not right. Try again.' }

    const userId = data.user?.id ?? null
    if (!userId) return { ok: false, error: GENERIC_ERROR }

    {
      const { getDeviceId } = await import('@/lib/coins/device-id')
      const deviceId = await getDeviceId()
      await postWithSession('/api/profile/anon', deviceId ? { deviceId } : undefined)
    }

    // Case B: a different auth.uid() than we started with, so the anonymous identity is left
    // behind. Log it; the real data merge ships with trophies.
    if (previousUserId && previousToken && previousUserId !== userId) {
      await postWithSession('/api/profile/merge', { fromAccessToken: previousToken })
    }

    return { ok: true }
  } catch {
    return { ok: false, error: GENERIC_ERROR }
  }
}

async function postWithSession(path: string, body?: unknown): Promise<void> {
  try {
    const { apiUrl } = await import('@/lib/config')
    const { data } = await getSupabase().auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return
    await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    // Best-effort. A missing profile row or audit row must never turn a successful sign-in
    // into a visible failure.
  }
}
