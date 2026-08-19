import { getSupabase } from '@/lib/supabase'

/**
 * Attach the caller's Supabase Auth bearer token when we have one, so server
 * routes (games/players/notifications) can identify the profile behind the
 * request. Guests get an empty object — the server treats them as anonymous
 * and the auth-gated behaviours (skip self-notify, cross-device continuation)
 * simply don't fire.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await getSupabase().auth.getSession()
    const token = data.session?.access_token
    if (!token) return {}
    return { Authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}
