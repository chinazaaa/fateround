import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

/**
 * Hand back the host_token to the profile that owns it.
 *
 * The host_token in localStorage is the sole proof of hostship for the browser client, so a
 * cleared storage, an incognito window, or opening the game on a different device leaves the
 * rightful host locked out even though `games.host_user_id` still points at their profile.
 * Since Slice 2 of the identity plan (`docs/accounts-and-identity-plan.md`), every logged-in
 * host has a verifiable profile — this route lets that profile reclaim its token instead of
 * relying on the device that happened to create the game.
 *
 * Additive by design (§3 of the identity plan): a guest with no profile just gets 404 and the
 * existing host_token flow keeps working. This never gates gameplay, only recovers a credential
 * the caller already owns.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const limited = await enforceRateLimit(req, RATE_LIMITS.hostReclaim)
  if (limited) return limited

  const { code } = await params
  const gameId = code.toUpperCase()

  const profileId = await getProfileFromRequest(req)
  if (!profileId) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { data: game } = await getSupabaseAdmin()
    .from('games')
    .select('host_token, host_user_id')
    .eq('id', gameId)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const hostUserId = (game as { host_user_id?: string | null }).host_user_id ?? null
  if (!hostUserId || hostUserId !== profileId) {
    // Deliberately opaque: don't confirm to a stranger that "there is a host but it isn't you".
    return NextResponse.json({ error: 'Not the host of this game' }, { status: 403 })
  }

  const hostToken = (game as { host_token?: string | null }).host_token ?? null
  if (!hostToken) return NextResponse.json({ error: 'Host token unavailable' }, { status: 404 })

  return NextResponse.json({ hostToken }, { status: 200 })
}
