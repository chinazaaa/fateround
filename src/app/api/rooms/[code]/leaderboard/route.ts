import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const roomCode = code.toUpperCase()

  const { data: members, error } = await supabase
    .from('room_members')
    .select('id, display_name, games_played, room_points')
    .eq('room_id', roomCode)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const leaderboard = (members ?? []).sort((a, b) => b.room_points - a.room_points || b.games_played - a.games_played)

  return NextResponse.json({ leaderboard })
}
