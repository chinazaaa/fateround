import { NextRequest, NextResponse } from 'next/server'
import { RoomServiceClient } from 'livekit-server-sdk'
import { authorizedRoomName, type AudioAuth } from '@/lib/audio-room-auth'

// How many people are currently in a room's voice chat, so the UI can nudge
// others to join. Authorized the same way as token minting; presence is a
// best-effort hint, so transport/empty-room failures resolve to a count of 0
// rather than erroring the caller.
export async function POST(req: NextRequest) {
  try {
    const { roomName, identity, auth } = (await req.json().catch(() => ({}))) as {
      roomName?: string
      identity?: string
      auth?: AudioAuth
    }

    if (!roomName || !identity) {
      return NextResponse.json({ error: 'roomName and identity are required' }, { status: 400 })
    }

    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL
    if (!apiKey || !apiSecret || !wsUrl) return NextResponse.json({ count: 0 })

    const authorizedRoom = await authorizedRoomName(roomName, identity, auth)
    if (!authorizedRoom) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    // RoomServiceClient talks to the LiveKit HTTP API (https), derived from the ws URL.
    const host = wsUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')
    const svc = new RoomServiceClient(host, apiKey, apiSecret)

    try {
      const participants = await svc.listParticipants(authorizedRoom)
      return NextResponse.json({ count: participants.length })
    } catch {
      // No LiveKit room exists until someone joins → treat as zero participants.
      return NextResponse.json({ count: 0 })
    }
  } catch (err) {
    console.error('[audio-presence] failed', err)
    return NextResponse.json({ count: 0 })
  }
}
