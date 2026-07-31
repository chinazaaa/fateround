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

/** Extract a bearer token from the Authorization header, if there is a well-formed one. */
function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token ? token : null
}

/**
 * Verify the caller's JWT and return their profile id.
 *
 * @returns the profile id (== auth.users.id), or null for a guest.
 */
export async function getProfileFromRequest(req: NextRequest): Promise<string | null> {
  const token = bearerToken(req)
  if (!token) return null
  // Verification needs the service role. Without it we cannot trust the token, and an
  // unverified token must never be honoured — fail closed to "guest".
  if (!hasServiceRoleKey()) return null
  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token)
    if (error) return null
    return data.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * True when the caller is a signed-in (non-anonymous) account rather than a guest.
 *
 * Use this only for things that genuinely require a real account — creating or joining a club,
 * owning a purchase. Never for gameplay.
 */
export async function isPermanentAccount(req: NextRequest): Promise<boolean> {
  const token = bearerToken(req)
  if (!token || !hasServiceRoleKey()) return false
  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token)
    if (error || !data.user) return false
    // Supabase marks anonymous users with `is_anonymous` on the user record; treat anything
    // unrecognised as anonymous so a new/unknown shape fails to the safer answer.
    return data.user.is_anonymous === false
  } catch {
    return false
  }
}
