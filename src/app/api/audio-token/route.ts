import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { AccessToken } from 'livekit-server-sdk'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

type AudioAuth = { kind: 'player' } | { kind: 'member' } | { kind: 'host'; token?: string }

/**
 * Verify the caller is genuinely associated with the room they're requesting a
 * token for, using trusted server-side state. `identity` is the caller's
 * server-generated secret id (player/member UUID); the host proves itself with
 * the game's host_token. Returns the canonical room ID when authorized, or null
 * when the caller is not permitted.
 */
async function authorizedRoomName(
  roomName: string,
  identity: string,
  auth: AudioAuth | undefined
): Promise<string | null> {
  if (!auth) return null
  const supabase = getSupabaseAdmin()

  if (auth.kind === 'player') {
    // 1. Fetch player's current game_id
    const { data: player } = await supabase.from('players').select('game_id').eq('id', identity).maybeSingle()
    if (!player) return null

    // 2. Check if it matches roomName directly (standalone game)
    if (player.game_id.toUpperCase() === roomName.toUpperCase()) return player.game_id

    // 3. Check if game is linked to a room whose ID matches roomName
    const { data: roomGame } = await supabase
      .from('room_games')
      .select('room_id')
      .eq('game_id', player.game_id)
      .maybeSingle()
    return roomGame && roomGame.room_id.toUpperCase() === roomName.toUpperCase() ? roomGame.room_id : null
  }

  if (auth.kind === 'member') {
    const { data } = await supabase.from('room_members').select('id, room_id').eq('id', identity).maybeSingle()
    return data && data.room_id?.toUpperCase() === roomName.toUpperCase() ? data.room_id : null
  }

  if (auth.kind === 'host') {
    if (!auth.token) return null

    // 1. Check if token matches room's creator_token directly
    const { data: room } = await supabase.from('rooms').select('id, creator_token').eq('id', roomName).maybeSingle()
    if (room?.creator_token && room.creator_token === auth.token) return room.id

    // 2. Check if token matches game's host_token directly (standalone game)
    const { data: game } = await supabase.from('games').select('id, host_token').eq('id', roomName).maybeSingle()
    if (game?.host_token && game.host_token === auth.token) return game.id

    // 3. Check if token matches any game linked to this room
    const { data: roomGames } = await supabase.from('room_games').select('game_id').eq('room_id', roomName)
    if (roomGames && roomGames.length > 0) {
      const gameIds = roomGames.map((rg) => rg.game_id)
      const { data: games } = await supabase.from('games').select('id, host_token').in('id', gameIds)
      const match = games?.find((g) => g.host_token === auth.token)
      if (match) return roomName
    }
  }

  return null
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

    const authorizedRoom = await authorizedRoomName(roomName, identity, auth)
    if (!authorizedRoom) {
      return NextResponse.json({ error: 'Not authorized to join this voice room' }, { status: 403 })
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: name || identity,
    })
    at.addGrant({ roomJoin: true, room: authorizedRoom, canPublish: true, canSubscribe: true })
    const token = await at.toJwt()
    return NextResponse.json({ token })
  } catch (err) {
    const message = internalErrorMessage('audio-token', err, 'Failed to generate token')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
