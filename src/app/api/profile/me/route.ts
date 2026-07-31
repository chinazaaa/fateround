import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
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
        'id, handle, avatar_url, is_anonymous, trophy_points, trophy_level, current_streak, longest_streak, last_active_date, streak_freezes'
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
