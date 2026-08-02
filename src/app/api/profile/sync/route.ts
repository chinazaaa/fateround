import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { syncEligibleTrophies } from '@/lib/trophies/award'

/**
 * Grant anything this profile already qualifies for.
 *
 * Exists because the award pass runs once per finished game, so a trophy added to the catalog
 * afterwards would otherwise sit at 100% and locked until the player happened to play again.
 * The trophy pages call this before reading, so opening your list is enough to collect.
 *
 * A POST, deliberately, even though the pages call it on load: it writes. A `GET` that silently
 * granted things would be a write endpoint wearing a read's name — and would get reviewed, and
 * cached, as though it weren't.
 *
 * It cannot inflate anything: it grants only what existing counters already justify, and never
 * touches the counters or the streak themselves.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, RATE_LIMITS.profileAttribute)
  if (limited) return limited

  try {
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ earned: [] })

    const earned = await syncEligibleTrophies(getSupabaseAdmin(), profileId)
    return NextResponse.json({ earned })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/sync', err) }, { status: 500 })
  }
}
