import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ROOM_PUBLIC_FIELDS, verifyRoomCreator } from '@/lib/room-api'
import { normalizeRoomDescription, normalizeRoomTimezone } from '@/lib/room-timezones'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()
  const body = await req.json()
  const creatorToken = String(body.creatorToken ?? '')

  const auth = await verifyRoomCreator(supabase, roomCode, creatorToken)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await supabase.from('rooms').delete().eq('id', roomCode)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()
  const body = await req.json()
  const creatorToken = String(body.creatorToken ?? '')

  const auth = await verifyRoomCreator(supabase, roomCode, creatorToken)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const updates: Record<string, unknown> = {}

  if (body.isPublic !== undefined) {
    updates.is_public = body.isPublic === true
  }

  if (body.description !== undefined) {
    const description = normalizeRoomDescription(body.description)
    if (body.description && !description) {
      return NextResponse.json({ error: 'Description is too long' }, { status: 400 })
    }
    updates.description = description
  }

  if (body.timezone !== undefined) {
    const timezone = normalizeRoomTimezone(body.timezone)
    if (body.timezone && !timezone) {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
    }
    updates.timezone = timezone
  }

  if (body.name !== undefined) {
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Room name is required' }, { status: 400 })
    if (name.length > 50) return NextResponse.json({ error: 'Room name must be 50 characters or less' }, { status: 400 })
    updates.name = name
  }

  if (body.maxMembers !== undefined) {
    const raw = body.maxMembers === '' || body.maxMembers === null ? null : Number(body.maxMembers)
    if (raw !== null && (isNaN(raw) || raw < 2)) {
      return NextResponse.json({ error: 'Max members must be 2 or more' }, { status: 400 })
    }
    updates.max_members = raw === null ? null : Math.floor(raw)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No settings to update' }, { status: 400 })
  }

  const { data: room, error } = await supabase
    .from('rooms')
    .update(updates)
    .eq('id', roomCode)
    .select(ROOM_PUBLIC_FIELDS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ room })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()

  const { data: room } = await supabase
    .from('rooms')
    .select(ROOM_PUBLIC_FIELDS)
    .eq('id', roomCode)
    .maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const [{ data: members }, { data: recentGames }] = await Promise.all([
    supabase
      .from('room_members')
      .select('id, display_name, member_code, joined_at, times_kissed, times_married, times_killed, games_played, room_points')
      .eq('room_id', roomCode)
      .order('joined_at', { ascending: true }),
    supabase
      .from('room_games')
      .select('id, game_id, created_at, started_by_member_id, room_members(display_name), games(title, game_type, status)')
      .eq('room_id', roomCode)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  return NextResponse.json({ room, members: members ?? [], recentGames: recentGames ?? [] })
}
