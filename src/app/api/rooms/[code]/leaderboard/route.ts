import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'

const supabase = getSupabaseAnon()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()

  const { data: members, error } = await supabase
    .from('room_members')
    .select('id, display_name, games_played, room_points')
    .eq('room_id', roomCode)

  if (error) return NextResponse.json({ error: internalErrorMessage('rooms/code/leaderboard', error) }, { status: 500 })

  const leaderboard = (members ?? []).sort((a, b) => b.room_points - a.room_points || b.games_played - a.games_played)

  return NextResponse.json({ leaderboard })
}
