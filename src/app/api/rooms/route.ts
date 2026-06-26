import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateGameCode } from '@/lib/utils'
import { countMembersByRoom, ROOM_PUBLIC_FIELDS } from '@/lib/room-api'
import { normalizeRoomDescription, normalizeRoomTimezone } from '@/lib/room-timezones'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const BROWSE_PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(
    Math.max(parseInt(searchParams.get('limit') ?? String(BROWSE_PAGE_SIZE), 10) || BROWSE_PAGE_SIZE, 1),
    50
  )
  const cursor = searchParams.get('cursor')

  let query = supabase
    .from('rooms')
    .select(ROOM_PUBLIC_FIELDS)
    .eq('is_public', true)
    .eq('is_locked', false)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data: rooms, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const page = (rooms ?? []).slice(0, limit)
  const hasMore = (rooms ?? []).length > limit
  const counts = await countMembersByRoom(
    supabase,
    page.map((room) => room.id)
  )

  return NextResponse.json({
    rooms: page.map((room) => ({
      ...room,
      memberCount: counts[room.id] ?? 0,
    })),
    hasMore,
    nextCursor: hasMore ? (page[page.length - 1]?.created_at ?? null) : null,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = String(body.name ?? '').trim()
  const maxMembersRaw = body.maxMembers !== undefined && body.maxMembers !== '' ? Number(body.maxMembers) : null
  const maxMembers =
    maxMembersRaw !== null && !isNaN(maxMembersRaw) && maxMembersRaw >= 2 ? Math.floor(maxMembersRaw) : null
  const isPublic = body.isPublic === true
  const description = normalizeRoomDescription(body.description)
  const timezone = normalizeRoomTimezone(body.timezone)

  if (!name) return NextResponse.json({ error: 'Room name is required' }, { status: 400 })
  if (name.length > 50) return NextResponse.json({ error: 'Room name must be 50 characters or less' }, { status: 400 })
  if (maxMembersRaw !== null && maxMembers === null) {
    return NextResponse.json({ error: 'Max members must be 2 or more' }, { status: 400 })
  }
  if (body.description && !description) {
    return NextResponse.json({ error: 'Description is too long' }, { status: 400 })
  }
  if (body.timezone && !timezone) {
    return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
  }

  let roomCode = generateGameCode()
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase.from('rooms').select('id').eq('id', roomCode).maybeSingle()
    if (!data) break
    roomCode = generateGameCode()
  }

  const creatorToken = generateGameCode() + generateGameCode()

  const { error } = await supabase.from('rooms').insert({
    id: roomCode,
    name,
    creator_token: creatorToken,
    max_members: maxMembers,
    is_public: isPublic,
    description,
    timezone,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ roomCode, creatorToken })
}
