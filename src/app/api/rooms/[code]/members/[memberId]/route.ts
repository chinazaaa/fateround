import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string; memberId: string }> }) {
  const { code, memberId } = await params
  const roomCode = code.toUpperCase()
  const body = await req.json()
  const creatorToken = String(body.creatorToken ?? '')

  if (!creatorToken) return NextResponse.json({ error: 'Creator token required' }, { status: 401 })

  const admin = getSupabaseAdmin()

  // creator_token is the room owner's secret; read it via the service role to authorize.
  const { data: room } = await admin.from('rooms').select('creator_token').eq('id', roomCode).maybeSingle()

  if (!room) return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  if (!room.creator_token || room.creator_token !== creatorToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { error } = await admin.from('room_members').delete().eq('id', memberId).eq('room_id', roomCode)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
