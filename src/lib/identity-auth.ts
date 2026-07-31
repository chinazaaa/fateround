/**
 * Layer 3 of the identity plan: attaching an email to an identity so it survives a new device
 * (`docs/accounts-and-identity-plan.md` §5, Slice 3; `docs/trophies-and-streaks.md` §2.2/§2.7).
 *
 * LOGIN == SIGNUP. The user never picks. They type an email, we send a 6-digit code, and the
 * backend either loads their account or creates one. UI copy must say "Save to profile", never
 * "Sign up" — the person acting might be a brand-new guest or a returning user who happens to
 * be signed out.
 *
 * WHY THIS RUNS CLIENT-SIDE and not through our own API routes, which is what the plan sketched:
 * verifying an OTP is what *creates the session*, and the session has to land in the browser's
 * own storage. Routing it through our server would mean receiving tokens there and shipping
 * them back to the client to call `setSession` — more moving parts, and the credentials would
 * transit our infrastructure for no benefit. Supabase rate-limits both calls itself.
 *
 * THE TWO CASES (trophies-and-streaks.md §2.7), which are different Supabase calls:
 *   Case A — a guest claims a brand-new email. The anonymous user is upgraded IN PLACE via
 *     `updateUser({ email })`, so `auth.uid()` never changes and every bit of progression
 *     carries over with no merge code at all.
 *   Case B — a guest signs into an email that already has an account elsewhere. Two identities
 *     exist and must be reconciled; we sign into the existing account and log the merge.
 * We can't know which case applies until we try, so Case A is attempted first and falls back.
 */
import { supabase } from '@/lib/supabase'

/** Which Supabase verification the code belongs to — the two cases need different types. */
export type EmailCodeFlow = 'upgrade' | 'signin'

export type RequestCodeResult = { ok: boolean; flow: EmailCodeFlow; error?: string }
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

/**
 * Send a 6-digit code to `email`.
 *
 * @returns the flow to hand back to {@link verifyEmailCode}. Always inspect `ok` — `flow` is
 * only meaningful when the request succeeded.
 */
export async function requestEmailCode(email: string): Promise<RequestCodeResult> {
  const address = email.trim().toLowerCase()
  if (!address) return { ok: false, flow: 'signin', error: 'Enter your email address' }

  try {
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user

    // Case A first: upgrading in place is strictly better than signing in, because it keeps
    // the same auth.uid() and therefore loses nothing.
    if (user?.is_anonymous) {
      const { error } = await supabase.auth.updateUser({ email: address })
      if (!error) return { ok: true, flow: 'upgrade' }
      // Anything other than "already registered" is a real failure worth surfacing; a taken
      // address just means this is Case B, so fall through and sign in instead.
      if (!isEmailTaken(error)) return { ok: false, flow: 'upgrade', error: error.message || GENERIC_ERROR }
    }

    const { error } = await supabase.auth.signInWithOtp({ email: address })
    if (error) return { ok: false, flow: 'signin', error: error.message || GENERIC_ERROR }
    return { ok: true, flow: 'signin' }
  } catch {
    return { ok: false, flow: 'signin', error: GENERIC_ERROR }
  }
}

/**
 * Verify the code and establish the permanent session.
 *
 * @param flow the value returned by {@link requestEmailCode} for this email.
 */
export async function verifyEmailCode(email: string, code: string, flow: EmailCodeFlow): Promise<VerifyCodeResult> {
  const address = email.trim().toLowerCase()
  const token = code.trim()
  if (!token) return { ok: false, error: 'Enter the code we emailed you' }

  try {
    // Capture the outgoing identity BEFORE verifying — after this call the session is replaced,
    // and in Case B this token is the only proof that the anonymous identity was ours. The
    // merge endpoint refuses to take a bare profile id precisely because it isn't a secret.
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

    // A brand-new account has no profile row yet; for an upgrade this is a harmless no-op.
    await ensureProfile()

    // Case B: we landed on a different auth.uid() than we started with, so the anonymous
    // identity has been left behind. Log it. The real data merge ships with trophies — there
    // is nothing to move yet, which is exactly why identity ships first.
    if (previousUserId && previousToken && previousUserId !== userId) {
      await recordMerge(previousToken)
    }

    return { ok: true }
  } catch {
    return { ok: false, error: GENERIC_ERROR }
  }
}

async function ensureProfile(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return
    await fetch('/api/profile/anon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    })
  } catch {
    // Best-effort; ensureServerIdentity() retries on the next finished game.
  }
}

async function recordMerge(fromAccessToken: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) return
    await fetch('/api/profile/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ fromAccessToken }),
    })
  } catch {
    // The sign-in itself succeeded, which is what the user cares about. A missing audit row
    // must never turn a successful login into a visible failure.
  }
}
