import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { AccessToken } from 'livekit-server-sdk'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type AudioAuth = { kind: 'player' } | { kind: 'member' } | { kind: 'host'; token?: string }

/**
 * Verifies whether the caller is authorized to join the requested room.
 *
 * @param roomName - The room or game identifier being requested.
 * @param identity - The caller's server-assigned identity.
 * @param auth - The authorization claim provided by the caller.
 * @returns `true` if the caller is associated with the requested room, `false` otherwise.
 */
async function isAuthorized(roomName: string, identity: string, auth: AudioAuth | undefined): Promise<boolean> {
  if (!auth) return false
  const supabase = getSupabaseAdmin()

  if (auth.kind === 'player') {
    // 1. Fetch player's current game_id
    const { data: player } = await supabase
      .from('players')
      .select('game_id')
      .eq('id', identity)
      .maybeSingle()
    if (!player) return false

    // 2. Check if it matches roomName directly (standalone game)
    if (player.game_id.toUpperCase() === roomName.toUpperCase()) return true

    // 3. Check if game is linked to a room whose ID matches roomName
    const { data: roomGame } = await supabase
      .from('room_games')
      .select('room_id')
      .eq('game_id', player.game_id)
      .maybeSingle()
    return Boolean(roomGame && roomGame.room_id.toUpperCase() === roomName.toUpperCase())
  }

  if (auth.kind === 'member') {
    const { data } = await supabase.from('room_members').select('id, room_id').eq('id', identity).maybeSingle()
    return Boolean(data && data.room_id?.toUpperCase() === roomName.toUpperCase())
  }

  if (auth.kind === 'host') {
    if (!auth.token) return false

    // 1. Check if token matches room's creator_token directly
    const { data: room } = await supabase
      .from('rooms')
      .select('creator_token')
      .eq('id', roomName)
      .maybeSingle()
    if (room?.creator_token && room.creator_token === auth.token) return true

    // 2. Check if token matches game's host_token directly (standalone game)
    const { data: game } = await supabase
      .from('games')
      .select('host_token')
      .eq('id', roomName)
      .maybeSingle()
    if (game?.host_token && game.host_token === auth.token) return true

    // 3. Check if token matches any game linked to this room
    const { data: roomGames } = await supabase
      .from('room_games')
      .select('game_id')
      .eq('room_id', roomName)
    if (roomGames && roomGames.length > 0) {
      const gameIds = roomGames.map((rg) => rg.game_id)
      const { data: games } = await supabase
        .from('games')
        .select('host_token')
        .in('id', gameIds)
      if (games && games.some((g) => g.host_token === auth.token)) return true
    }
  }

  return false
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { roomName, identity, name, auth } = body as {
      roomName?: string
      identity?: string
      name?: string
      auth?: AudioAuth
    }

    if (!roomName || !identity) {
      return NextResponse.json({ error: 'roomName and identity are required' }, { status: 400 })
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set in environment variables' },
        { status: 500 }
      )
    }

    const authorized = await isAuthorized(roomName, identity, auth)
    if (!authorized) {
      return NextResponse.json({ error: 'Not authorized to join this voice room' }, { status: 403 })
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: name || identity,
    })
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true })
    const token = await at.toJwt()
    return NextResponse.json({ token })
  } catch (err) {
    const message = internalErrorMessage('audio-token', err, 'Failed to generate token')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
