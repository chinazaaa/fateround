/**
 * Mobile mirror of `src/lib/identity.ts` on web — Layer 2 of the identity plan
 * (`docs/accounts-and-identity-plan.md` §5, Slice 2).
 *
 * Nothing calls this yet; Slice 3 wires `ensureServerIdentity()` into the game-finish path.
 *
 * Mobile is READ-ONLY for entitlements and must never sell anything: all checkout happens on
 * the web, and per Apple/Google rules the app must not even link out to a paywall. Signing in
 * here exists so a plan bought on the web is recognised on the phone — nothing more.
 *
 * As on web, every function resolves to null rather than throwing: a player with no identity
 * still plays a completely normal game.
 */
import { apiUrl } from '@/lib/config'
import { clearLocalIdentity } from '@/lib/identity-local'
import { getSupabase } from '@/lib/supabase'

/**
 * Ensure this device has an anonymous (or already-signed-in) identity and a `profiles` row.
 * Idempotent — an existing session is reused, so a returning player keeps the same profile.
 *
 * @returns the profile/user id, or null if identity could not be established.
 */
export async function ensureServerIdentity(): Promise<string | null> {
  try {
    const supabase = getSupabase()
    const { data: existing } = await supabase.auth.getSession()
    let userId = existing.session?.user?.id ?? null

    if (!userId) {
      const { data, error } = await supabase.auth.signInAnonymously()
      // Expected failure: the per-IP anonymous sign-in rate limit. Carry on as a guest.
      if (error) return null
      userId = data.user?.id ?? null
    }
    if (!userId) return null

    await ensureProfileRow()
    return userId
  } catch {
    return null
  }
}

/** Idempotent upsert of the `profiles` row for the current session. Best-effort. */
async function ensureProfileRow(): Promise<void> {
  const headers = await authHeaders()
  if (!headers) return
  try {
    await fetch(apiUrl('/api/profile/anon'), { method: 'POST', headers })
  } catch {
    // Offline or transient — the next ensureServerIdentity() retries.
  }
}

/** The current access token, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabase().auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

/**
 * Headers to attach to an API call that should be attributed to this profile, or null when
 * there is no identity. Null means "send the request without them", never "skip the request".
 */
export async function authHeaders(): Promise<Record<string, string> | null> {
  const token = await getAccessToken()
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : null
}

/**
 * Sign out and start fresh — the "Not you? Switch" action (Slice 4). Sessions themselves never
 * expire (§4A), so this is the only way to change identity on a shared device.
 *
 * Destructive for a guest: an anonymous identity has no email, so signing out abandons its
 * progression permanently. Only call from a deliberate, confirmed user action.
 */
export async function signOutIdentity(): Promise<void> {
  try {
    await getSupabase().auth.signOut()
  } catch {
    // Ignore — clearing the local name below is the part the user actually sees.
  }
  await clearLocalIdentity()
}
