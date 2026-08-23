import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getProfileFromRequest } from '@/lib/identity-server'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { generateResumeToken } from '@/lib/utils'
import { parsePlayerGenderFromDb } from '@/lib/participants'

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

  // If the same profile also holds a player seat in this game (host + play), move
  // that seat to this device too — rotating the resume token so the old device's
  // stored credential stops authenticating. Without this the take-over prompt
  // ("Take over hosting on this device?") makes the caller HOST-ONLY here even
  // though they were host + player: on the destination device, useHostSeat has no
  // player session to seed from, so hostPlayerId stays null and the roster row
  // for their own seat is unreachable from here. Best-effort: a missing row, a
  // rotate failure, or a signed-out player all fall back to host-token-only.
  let player: {
    playerId: string
    playerName: string
    playerGender: string
    resumeToken: string
  } | null = null
  try {
    const { data: existingPlayer } = await getSupabaseAdmin()
      .from('players')
      .select('id, name, gender, resume_token')
      .eq('game_id', gameId)
      .eq('user_id', profileId)
      .maybeSingle()
    if (existingPlayer) {
      const rotatedResumeToken = generateResumeToken()
      const { data: rotated, error: rotateError } = await getSupabaseAdmin()
        .from('players')
        .update({ resume_token: rotatedResumeToken })
        .eq('id', (existingPlayer as { id: string }).id)
        .select('id, name, gender, resume_token')
        .single()
      if (!rotateError && rotated) {
        const gender = parsePlayerGenderFromDb((rotated as { gender?: unknown }).gender) ?? 'both'
        player = {
          playerId: (rotated as { id: string }).id,
          playerName: (rotated as { name?: string | null }).name ?? '',
          playerGender: gender,
          resumeToken: (rotated as { resume_token: string }).resume_token,
        }
      }
    }
  } catch {
    // Player-seat handoff is best-effort — a failure here still returns the host token.
  }

  return NextResponse.json({ hostToken, player }, { status: 200 })
}
