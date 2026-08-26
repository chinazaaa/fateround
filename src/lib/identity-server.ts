/**
 * Server half of the identity layer (`docs/accounts-and-identity-plan.md` §5, Slice 2):
 * turn an incoming request into a profile id, or into nothing at all.
 *
 * Why a bearer header rather than cookies/SSR: the app has no `@supabase/ssr` and no
 * cookie-aware client, and `docs/rls-hardening.md` already establishes the house rule that
 * "authorization is by the token IN THE REQUEST, never by device/cookie/IP". Verifying a JWT
 * the client sends explicitly is the same shape as the existing host/resume-token checks, so
 * identity slots into the codebase instead of introducing a second, competing auth model.
 *
 * THIS FUNCTION MUST NEVER THROW AND MUST NEVER GATE A REQUEST. A missing, expired, malformed
 * or unverifiable token all return null, meaning "an un-attributed guest" — which is a fully
 * supported, permanent state. Any caller that turns null into a 401 on a gameplay route has
 * broken the two-worlds rule and made auth a dependency of playing.
 */
import type { NextRequest } from 'next/server'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'

/** How long we'll wait on Supabase Auth before giving up and treating the caller as a guest. */
const VERIFY_TIMEOUT_MS = 5000

/** Extract a bearer token from the Authorization header, if there is a well-formed one. */
function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

/**
 * True when the request carries a bearer token, regardless of whether it
 * verifies. Callers on the guest-earning path use this to distinguish "no
 * identity at all" (real guest — write pending grants) from "signed-in but
 * Auth just timed out or errored" (transient — DON'T write pending grants,
 * or the recovery-time `migrate_guest_grants` will credit phantom guest
 * coins to the signed-in user's profile).
 *
 * Motivating incident: during the 2026-08-24 DB saturation, Supabase Auth
 * flapped Unhealthy. `getIdentityFromRequest` timed out at 5s and returned
 * null, and `/api/profile/attribute` fell into the guest branch for genuine
 * signed-in users, writing rows to `guest_pending_grants` keyed on their
 * device. Once Auth recovered and a re-auth re-fired the migration, those
 * rows were credited to their profile up to the 500-coin cap.
 */
export function hasBearerToken(req: NextRequest): boolean {
  return bearerToken(req) !== null
}

export type RequestIdentity = {
  profileId: string
  /** False once an email identity is attached. Drives `profiles.is_anonymous`. */
  isAnonymous: boolean
}

/**
 * Verify the caller's JWT once and return both their id and whether they're still anonymous.
 *
 * Prefer this over calling {@link getProfileFromRequest} and {@link isPermanentAccount}
 * together — that would verify the same token twice, doubling the round-trips to Supabase Auth
 * on a path that runs on every attributed game.
 *
 * Bounded by a timeout: this sits in front of gameplay-adjacent routes, and a hanging auth
 * service must degrade to "guest" rather than holding the request open.
 */
export async function getIdentityFromRequest(req: NextRequest): Promise<RequestIdentity | null> {
  const token = bearerToken(req)
  if (!token) return null
  // Verification needs the service role. Without it we cannot trust the token, and an
  // unverified token must never be honoured — fail closed to "guest".
  if (!hasServiceRoleKey()) return null
  try {
    const verification = getSupabaseAdmin().auth.getUser(token)
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), VERIFY_TIMEOUT_MS))
    const result = await Promise.race([verification, timeout])
    if (!result || result.error || !result.data.user) return null
    return {
      profileId: result.data.user.id,
      // Treat an unrecognised user shape as anonymous — the safer answer, since this gates
      // account-only things like clubs and purchases.
      isAnonymous: result.data.user.is_anonymous !== false,
    }
  } catch {
    return null
  }
}

/**
 * Verify the caller's JWT and return their profile id.
 *
 * @returns the profile id (== auth.users.id), or null for a guest.
 */
export async function getProfileFromRequest(req: NextRequest): Promise<string | null> {
  return (await getIdentityFromRequest(req))?.profileId ?? null
}

/**
 * True when the caller is a signed-in (non-anonymous) account rather than a guest.
 *
 * Use this only for things that genuinely require a real account — creating or joining a club,
 * owning a purchase. Never for gameplay.
 */
export async function isPermanentAccount(req: NextRequest): Promise<boolean> {
  const identity = await getIdentityFromRequest(req)
  return identity ? !identity.isAnonymous : false
}
