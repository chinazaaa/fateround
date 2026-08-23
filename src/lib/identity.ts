/**
 * Layer 2 of the identity plan (`docs/accounts-and-identity-plan.md` §5, Slice 2):
 * the anonymous server identity that trophies, streaks and subscriptions hang off.
 *
 * Nothing calls this yet. Slice 3 wires `ensureServerIdentity()` into the game-finish path —
 * deliberately NOT into page load or join, because anonymous sign-ins are rate-limited to
 * 30/hour per IP and a 40-student classroom shares one IP (§2.2).
 *
 * THE RULE THIS FILE MUST NEVER BREAK: gameplay does not depend on any of it. Every function
 * here resolves to null on failure rather than throwing, so a signed-out, rate-limited or
 * offline player still plays a completely normal game. Callers must treat a null identity as
 * "this player has no progression", never as an error state.
 */
import { supabase } from '@/lib/supabase'
import { clearLocalIdentity } from '@/lib/identity-local'
import { getDeviceId } from '@/lib/coins/device-id'

/**
 * Ensure this device has an anonymous (or already-signed-in) identity, and that a matching
 * `profiles` row exists. Idempotent and safe to call repeatedly — an existing session is
 * reused, so a returning player keeps the same profile and counts as the same Supabase MAU.
 *
 * @returns the profile/user id, or null if identity could not be established.
 */
export async function ensureServerIdentity(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  try {
    const { data: existing } = await supabase.auth.getSession()
    let userId = existing.session?.user?.id ?? null

    if (!userId) {
      const { data, error } = await supabase.auth.signInAnonymously()
      // The expected failure here is the per-IP rate limit. Swallow it: the player carries on
      // as a pure guest and we try again after their next finished game.
      if (error) return null
      userId = data.user?.id ?? null
    }
    if (!userId) return null

    // The auth user and the profile row are created by two different systems, so the profile
    // can legitimately be missing (a failed call last time). This endpoint is an idempotent
    // upsert, not a create.
    await ensureProfileRow()
    return userId
  } catch {
    return null
  }
}

/**
 * Idempotent upsert of the `profiles` row for the current session. Best-effort.
 *
 * Carries the local device id so `/api/profile/anon` can — for signed-up
 * accounts only — run `migrate_guest_grants()` and fold pending guest earnings
 * into the profile ledger. Anonymous callers keep sending an empty body.
 */
export type EnsureProfileRowResult = {
  welcomeGrant: number | null
  migrationGrant: number | null
  isAnonymous: boolean | null
}

async function ensureProfileRow(): Promise<EnsureProfileRowResult> {
  const headers = await authHeaders()
  if (!headers) return { welcomeGrant: null, migrationGrant: null, isAnonymous: null }
  try {
    const deviceId = getDeviceId()
    const res = await fetch('/api/profile/anon', {
      method: 'POST',
      headers,
      body: JSON.stringify(deviceId ? { deviceId } : {}),
    })
    if (!res.ok) return { welcomeGrant: null, migrationGrant: null, isAnonymous: null }
    const data = (await res.json().catch(() => null)) as
      | { welcomeGrant?: number | null; migrationGrant?: number | null; isAnonymous?: boolean }
      | null
    return {
      welcomeGrant: data?.welcomeGrant ?? null,
      migrationGrant: data?.migrationGrant ?? null,
      isAnonymous: data?.isAnonymous ?? null,
    }
  } catch {
    return { welcomeGrant: null, migrationGrant: null, isAnonymous: null }
  }
}

/** Force a re-sync — used right after an email-upgrade so grant_welcome + guest migration fire. */
export async function refreshProfileRow(): Promise<EnsureProfileRowResult> {
  return ensureProfileRow()
}

/** The current access token, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

/**
 * Headers to attach to an API call that should be attributed to this profile, or null when
 * there is no identity. Null means "send the request without them" — never "skip the request".
 */
export async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getAccessToken()
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : null
}

/**
 * Sign out and start fresh. This is the "Not you? Switch" action on the profile chip (Slice 4),
 * which is how we handle a shared family device — sessions themselves never expire (§4A).
 *
 * Destructive for a guest: an anonymous identity has no email, so signing out abandons its
 * progression permanently. Only ever call this from a deliberate, confirmed user action.
 */
export async function signOutIdentity(): Promise<void> {
  try {
    await supabase.auth.signOut()
  } catch {
    // Ignore — clearing the local name below is the part the user actually sees.
  }
  clearLocalIdentity()
}
