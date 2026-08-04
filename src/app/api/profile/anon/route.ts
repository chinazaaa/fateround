import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getIdentityFromRequest } from '@/lib/identity-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { randomDisplayName } from '@/lib/random-name'

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
    const identity = await getIdentityFromRequest(req)
    // No valid token: not an error worth surfacing, just nothing to do. The caller is a guest
    // and must carry on playing normally.
    if (!identity) return NextResponse.json({ profileId: null }, { status: 200 })

    const { error } = await getSupabaseAdmin()
      .from('profiles')
      // Only `id` and `is_anonymous` are written, so an existing row keeps its handle, streak
      // and trophy counters — a plain "ensure" call must never reset a returning player.
      //
      // `is_anonymous` has to be updated on conflict, not ignored. It is the authoritative
      // source of the row's own truth, and after a Case-A upgrade (updateUser({email}) on the
      // same auth.uid()) the profile row already exists — so an insert-only upsert would leave
      // it stuck at its `true` default forever. The chip would keep reading "Guest" for a
      // signed-in player, and every account-gated feature (clubs, Pro) would refuse them.
      .upsert(
        { id: identity.profileId, is_anonymous: identity.isAnonymous },
        { onConflict: 'id', ignoreDuplicates: false }
      )

    if (error) {
      return NextResponse.json({ error: internalErrorMessage('profile/anon', error) }, { status: 500 })
    }

    // Give brand-new profiles a friendly random name so leaderboards aren't a wall of "Guest".
    // Scoped to handle IS NULL, so it only ever fires on first creation and never overwrites a
    // name the player has chosen (or a returning player's existing handle).
    await getSupabaseAdmin()
      .from('profiles')
      .update({ handle: randomDisplayName() })
      .eq('id', identity.profileId)
      .is('handle', null)

    return NextResponse.json({ profileId: identity.profileId }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/anon', err) }, { status: 500 })
  }
}
