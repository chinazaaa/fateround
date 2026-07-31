import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * Ensure a `profiles` row exists for the caller's identity.
 *
 * Called by `ensureServerIdentity()` right after an anonymous sign-in. The auth user and the
 * profile row are created by two different systems, so this is an idempotent UPSERT rather than
 * a create — a caller whose profile write failed last time can simply call again.
 *
 * The client cannot write `profiles` directly (no INSERT policy — see the Slice 2 migration), so
 * this route is the only way the row comes into existence, and it derives the id from the
 * verified JWT rather than the body. There is nothing here a caller can forge or aim at someone
 * else's profile.
 */
export async function POST(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    // No valid token: not an error worth surfacing, just nothing to do. The caller is a guest
    // and must carry on playing normally.
    if (!profileId) return NextResponse.json({ profileId: null }, { status: 200 })

    const { error } = await getSupabaseAdmin()
      .from('profiles')
      // `ignoreDuplicates` keeps this a true no-op for an existing profile: a returning player
      // must never have their handle, streak or trophy counters reset by a plain "ensure" call.
      .upsert({ id: profileId }, { onConflict: 'id', ignoreDuplicates: true })

    if (error) {
      return NextResponse.json({ error: internalErrorMessage('profile/anon', error) }, { status: 500 })
    }

    return NextResponse.json({ profileId }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/anon', err) }, { status: 500 })
  }
}
