import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { internalErrorMessage } from '@/lib/api-errors'
import { getProfileFromRequest } from '@/lib/identity-server'
import { parseJsonBody } from '@/lib/parse-body'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { awardForFinishedGame } from '@/lib/trophies/award'
import { normalizeResumeToken } from '@/lib/utils'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Link a `players` row to the caller's profile — the single join between the two identity
 * worlds (`docs/accounts-and-identity-plan.md` §3).
 *
 * WHY THIS IS ITS OWN ENDPOINT rather than a bearer header on the finish request, which is what
 * the plan originally said: a game reaches `finished` from three different places, and two of
 * them have no finishing player attached.
 *   - the host pressing "End game" (attributes the *host*, who may not even be playing),
 *   - a quorum-elected client driving `/advance` on behalf of the room,
 *   - the server ticker in `game-tick.ts`, which posts with no auth and no browser at all.
 * Attribution hung off the finish request would therefore silently skip every timed/round-based
 * game. A call the player's *own* client makes when it observes the finish works uniformly for
 * all of them, and needs no changes to the ~40 sites that call `markGameFinished`.
 *
 * The two credentials do exactly one job each, which is the architecture in miniature:
 *   - `resumeToken` (gameplay world) proves which player row is yours,
 *   - the bearer JWT (progression world) proves which profile is yours.
 *
 * Never fails the caller. A guest, a stale token or an already-claimed row all return 200 with
 * `attributed: false` — this runs on the finished screen of a game that already went fine, and
 * must never surface an error there.
 */
const attributeSchema = z.object({
  gameCode: z.string().min(4),
  resumeToken: z.string().min(4),
})

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, RATE_LIMITS.profileAttribute)
  if (limited) return limited

  const { data: body, error: bodyError } = await parseJsonBody(req, attributeSchema)
  if (bodyError) return bodyError

  try {
    // No identity: the overwhelmingly common case (every guest, every game). Not an error.
    const profileId = await getProfileFromRequest(req)
    if (!profileId) return NextResponse.json({ attributed: false, reason: 'no_identity' })

    const gameId = body.gameCode.toUpperCase()
    const resumeToken = normalizeResumeToken(body.resumeToken)
    if (resumeToken.length < 4) {
      return NextResponse.json({ attributed: false, reason: 'bad_token' })
    }

    const admin = getSupabaseAdmin()
    const { data: player, error: lookupError } = await admin
      .from('players')
      .select('id, profile_id')
      .eq('game_id', gameId)
      .eq('resume_token', resumeToken)
      .maybeSingle()

    if (lookupError) {
      return NextResponse.json({ error: internalErrorMessage('profile/attribute', lookupError) }, { status: 500 })
    }
    if (!player) return NextResponse.json({ attributed: false, reason: 'player_not_found' })

    // Already linked to this profile — the client retries on every mount of the finished
    // screen, so this is the normal repeat case, not a conflict. Still run the award pass:
    // it is idempotent, and a first attempt whose award failed must be able to recover.
    if (player.profile_id === profileId) {
      return NextResponse.json({ attributed: true, ...(await runAwardPass(admin, profileId, gameId)) })
    }

    // Linked to somebody else: two different profiles used this device/seat (a sign-out and
    // sign-in mid-game). Leave the original owner in place rather than silently stealing the
    // row — whoever actually played it earns it.
    if (player.profile_id) return NextResponse.json({ attributed: false, reason: 'claimed' })

    const { error: updateError } = await admin
      .from('players')
      .update({ profile_id: profileId })
      .eq('id', player.id)
      // Re-check under the write so two concurrent tabs can't both claim the row.
      .is('profile_id', null)

    if (updateError) {
      return NextResponse.json({ error: internalErrorMessage('profile/attribute', updateError) }, { status: 500 })
    }

    return NextResponse.json({ attributed: true, ...(await runAwardPass(admin, profileId, gameId)) })
  } catch (err) {
    return NextResponse.json({ error: internalErrorMessage('profile/attribute', err) }, { status: 500 })
  }
}

/**
 * Award trophies and advance the streak for this profile and game.
 *
 * THIS is the award hook — not the finish path. `players.profile_id` is written here, after
 * the game ended, so an award pass at finish would find no profile to award to
 * (see `src/lib/trophies/award.ts`).
 *
 * Best-effort by design: the attribution itself already succeeded, and a trophy that failed to
 * land must not turn the player's finished game into an error. `awardForFinishedGame` is
 * idempotent, so the next retry picks it up.
 */
async function runAwardPass(
  admin: SupabaseClient,
  profileId: string,
  gameId: string
): Promise<{ earned?: { id: string; title: string; tier: string; points: number }[]; gameType?: string }> {
  try {
    const result = await awardForFinishedGame(admin, profileId, gameId)
    // Only surface trophies earned by THIS pass — that is what the post-win prompt celebrates.
    if (!result.earned.length) return {}
    // The game type travels with the result so the finished-screen link knows where to point.
    // Reading it here costs one small select on a path that already did several; the
    // alternative was threading the type through both game chromes into ~40 views.
    const { data: game } = await admin.from('games').select('game_type').eq('id', gameId).maybeSingle()
    return { earned: result.earned, gameType: (game?.game_type as string) ?? undefined }
  } catch {
    return {}
  }
}
