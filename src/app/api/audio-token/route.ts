import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { AccessToken } from 'livekit-server-sdk'
import { authorizedRoom, type AudioAuth } from '@/lib/audio-room-auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { roomName, name, auth } = body as {
      roomName?: string
      name?: string
      auth?: AudioAuth
    }

    if (!roomName) {
      return NextResponse.json({ error: 'roomName is required' }, { status: 400 })
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: 'LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set in environment variables' },
        { status: 500 }
      )
    }

    const authorized = await authorizedRoom(roomName, auth)
    if (!authorized) {
      return NextResponse.json({ error: 'Not authorized to join this voice room' }, { status: 403 })
    }

    // Identity comes from the authorized row, never from the request body — otherwise a
    // caller holding their own valid token could still mint one under someone else's
    // identity and appear in the room as them.
    const at = new AccessToken(apiKey, apiSecret, {
      identity: authorized.identity,
      name: name || authorized.identity,
    })
    at.addGrant({ roomJoin: true, room: authorized.room, canPublish: true, canSubscribe: true })
    const token = await at.toJwt()
    return NextResponse.json({ token })
  } catch (err) {
    const message = internalErrorMessage('audio-token', err, 'Failed to generate token')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
