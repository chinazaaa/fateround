import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()

  const { data: games, error } = await supabase
    .from('room_games')
    .select(
      'id, game_id, created_at, started_by_member_id, room_members(display_name), games(title, game_type, status)'
    )
    .eq('room_id', roomCode)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ games: games ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()

  const body = await req.json()
  const gameCode = String(body.gameCode ?? '')
    .trim()
    .toUpperCase()
  const memberCode = String(body.memberCode ?? '')
    .trim()
    .toUpperCase()

  if (!gameCode) return NextResponse.json({ error: 'gameCode is required' }, { status: 400 })

  const [{ data: room }, { data: game }] = await Promise.all([
    supabase.from('rooms').select('id').eq('id', roomCode).maybeSingle(),
    supabase.from('games').select('id').eq('id', gameCode).maybeSingle(),
  ])

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const admin = getSupabaseAdmin()

  // Resolve the acting member from their secret member_code (read via service role).
  let memberId: string | null = null
  if (memberCode) {
    const { data: member } = await admin
      .from('room_members')
      .select('id')
      .eq('room_id', roomCode)
      .eq('member_code', memberCode)
      .maybeSingle()
    memberId = member?.id ?? null
  }

  const { error } = await admin
    .from('room_games')
    .insert({ room_id: roomCode, game_id: gameCode, started_by_member_id: memberId })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ success: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
