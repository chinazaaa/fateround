import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { resolveRoomCodeForGame } from '@/lib/room-points'

const supabase = getSupabaseAnon()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = await resolveRoomCodeForGame(supabase, code)
  if (!roomCode) return NextResponse.json({ error: 'Game is not linked to a room' }, { status: 404 })
  return NextResponse.json({ roomCode })
}
