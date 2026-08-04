import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

/**
 * The signed-in player's own profile — what the profile chip renders (Slice 4).
 *
 * A guest gets `{ profile: null }` and a 200, not a 401: having no identity is a supported
 * state, and the chip shows "Guest" rather than an error.
 *
 * The trophy/streak fields are already in the schema but stay at their defaults until the
 * trophies batch ships, so the chip will read `🔥 0 · 🏆 0` for now. That's expected.
 */
export async function GET(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ profile: null })

    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .select(
        'id, handle, handle_is_auto, avatar_url, is_anonymous, trophy_points, trophy_level, current_streak, longest_streak, last_active_date, streak_freezes'
      )
      .eq('id', profileId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: internalErrorMessage('profile/me', error) }, { status: 500 })

    // Verified token but no row yet — the sign-in landed and the profile upsert hasn't. Report
    // it as "no profile" so the caller re-runs ensureServerIdentity() rather than erroring.
    return NextResponse.json({ profile: data ?? null })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/me', err) }, { status: 500 })
  }
}

/**
 * Set the player's display name.
 *
 * `handle` is deliberately NOT unique. This is a party game, not a social network — two people
 * called Chinaza is a normal Tuesday, and a uniqueness constraint would mean rejecting someone's
 * actual name and inventing chinaza_2. Per-game name collisions are already handled where they
 * matter, inside a single room.
 *
 * Only the handle is writable here. Everything else on `profiles` — streaks, trophy points,
 * level, is_anonymous — is server-owned, and a route that let the client patch arbitrary columns
 * would be the "row access is not column access" hole: one PATCH away from a self-granted level.
 */
const patchSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(1, 'Enter a name')
    // Matches the per-game name input, so a profile name always fits where names are shown.
    .max(50, 'Names are limited to 50 characters'),
})

export async function PATCH(req: NextRequest) {
  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const { data: body, error: bodyError } = await parseJsonBody(req, patchSchema)
    if (bodyError) return bodyError

    // The player is choosing their own name now, so it's no longer the auto-assigned one.
    const { error } = await getSupabaseAdmin()
      .from('profiles')
      .update({ handle: body.handle, handle_is_auto: false })
      .eq('id', profileId)

    if (error) return NextResponse.json({ error: internalErrorMessage('profile/me', error) }, { status: 500 })
    return NextResponse.json({ handle: body.handle })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/me', err) }, { status: 500 })
  }
}
