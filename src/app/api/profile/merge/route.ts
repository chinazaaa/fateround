import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { parseJsonBody } from '@/lib/parse-body'
import { getSupabaseAdmin, hasServiceRoleKey } from '@/lib/supabase-admin'

/**
 * Record a Case-B merge: a guest on this device signed into an account that already exists
 * elsewhere, so two `auth.users` rows have to be reconciled
 * (`docs/trophies-and-streaks.md` §2.7).
 *
 * TODAY THIS ONLY WRITES THE AUDIT ROW. That is not an oversight — it is the payoff for
 * shipping identity before trophies: with no progression data in existence yet there is
 * literally nothing to merge, so the hard part is free. The real `mergeProfiles()` (union
 * trophies keeping the earlier `earned_at`, max per-game counters, longer streak) lands with
 * the trophies batch and will read this same log.
 *
 * SECURITY — why the caller sends a TOKEN, not a profile id.
 * The obvious shape is `{ fromProfileId }`. That is safe only while merging is a no-op; the
 * moment a real merge exists it becomes "move that stranger's trophies onto my account", since
 * a profile id is not a secret. So ownership of BOTH identities has to be proven:
 *   - the bearer header proves the destination account is yours,
 *   - `fromAccessToken` — the anonymous session's own JWT, captured client-side just before it
 *     was replaced — proves the source identity was yours too.
 * Both are verified here. Neither is trusted from the body as a bare id.
 */
const mergeSchema = z.object({
  /** The pre-sign-in anonymous session's access token. Proves the caller owned that identity. */
  fromAccessToken: z.string().min(10),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, mergeSchema)
  if (bodyError) return bodyError

  try {
    const intoProfile = await getProfileFromRequest(req)
    if (!intoProfile) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    if (!hasServiceRoleKey()) return NextResponse.json({ error: 'Not available' }, { status: 503 })

    const admin = getSupabaseAdmin()

    // Verify the source token rather than believing an id in the body.
    const { data: fromUser, error: fromError } = await admin.auth.getUser(body.fromAccessToken)
    if (fromError || !fromUser.user) {
      return NextResponse.json({ error: 'Could not verify the previous session' }, { status: 400 })
    }
    const fromProfile = fromUser.user.id

    // Case A (upgrade in place) keeps the same auth.uid(), so there is nothing to merge and
    // nothing to log. Treat it as success so the client doesn't have to special-case it.
    if (fromProfile === intoProfile) return NextResponse.json({ merged: false, reason: 'same_identity' })

    const { error: logError } = await admin
      .from('profile_merges')
      .insert({ from_profile: fromProfile, into_profile: intoProfile })

    if (logError) {
      return NextResponse.json({ error: internalErrorMessage('profile/merge', logError) }, { status: 500 })
    }

    // Move the guest's progression onto the account they signed into: seats, earned trophies,
    // distinct sets, per-game stats (summed) and the better streak. Atomic + idempotent in the DB
    // (see migration 20260815000000). Best-effort: the sign-in already succeeded and the audit row
    // is written, so a merge hiccup is a retryable "your trophies will appear shortly", never a
    // failed login. `bump_player_stats` and this function are service-role only.
    const { error: mergeError } = await admin.rpc('merge_profiles', { p_from: fromProfile, p_into: intoProfile })
    if (mergeError) {
      return NextResponse.json({
        merged: false,
        pending: true,
        error: internalErrorMessage('profile/merge', mergeError),
      })
    }

    return NextResponse.json({ merged: true })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/merge', err) }, { status: 500 })
  }
}
