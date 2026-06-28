import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateGameCode } from '@/lib/utils'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()

  const { data: room } = await supabase
    .from('rooms')
    .select('id, max_members, is_locked')
    .eq('id', roomCode)
    .maybeSingle()
  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })

  const body = await req.json()
  const admin = getSupabaseAdmin()

  // Returning member — verify by member code (secret credential; read via service role)
  if (body.memberCode) {
    const memberCode = String(body.memberCode).trim().toUpperCase()
    const { data: member } = await admin
      .from('room_members')
      .select('id, display_name, member_code, times_kissed, times_married, times_killed, games_played')
      .eq('room_id', roomCode)
      .eq('member_code', memberCode)
      .maybeSingle()

    if (!member) return NextResponse.json({ error: 'Member code not found in this room' }, { status: 404 })

    return NextResponse.json({
      memberId: member.id,
      memberCode: member.member_code,
      displayName: member.display_name,
      isNew: false,
    })
  }

  // New member — join with display name
  if (room.is_locked) {
    return NextResponse.json(
      { error: 'This room is locked. If you know the host, reach out to them.', locked: true },
      { status: 403 }
    )
  }

  const displayName = String(body.displayName ?? '').trim()
  if (!displayName) return NextResponse.json({ error: 'Display name is required' }, { status: 400 })

  // Check room cap
  if (room.max_members) {
    const { count } = await supabase
      .from('room_members')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomCode)
    if ((count ?? 0) >= room.max_members) {
      return NextResponse.json({ error: `Room is full (${room.max_members} members max)` }, { status: 409 })
    }
  }
  if (displayName.length > 30)
    return NextResponse.json({ error: 'Name must be 30 characters or less' }, { status: 400 })

  const { data: nameTaken } = await supabase
    .from('room_members')
    .select('id')
    .eq('room_id', roomCode)
    .ilike('display_name', displayName)
    .maybeSingle()

  if (nameTaken) return NextResponse.json({ error: 'That name is already taken in this room' }, { status: 400 })

  let memberCode = generateGameCode()
  for (let i = 0; i < 10; i++) {
    const { data } = await admin.from('room_members').select('id').eq('member_code', memberCode).maybeSingle()
    if (!data) break
    memberCode = generateGameCode()
  }

  const { data: member, error } = await admin
    .from('room_members')
    .insert({ room_id: roomCode, member_code: memberCode, display_name: displayName })
    .select('id, display_name, member_code')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    memberId: member.id,
    memberCode: member.member_code,
    displayName: member.display_name,
    isNew: true,
  })
}
