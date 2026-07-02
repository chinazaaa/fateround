import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { resolveRoomMemberForGame } from '@/lib/room-points'

const supabase = getSupabaseAnon()

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const memberCode = req.nextUrl.searchParams.get('member')
  if (!memberCode?.trim()) {
    return NextResponse.json({ error: 'member is required' }, { status: 400 })
  }

  const member = await resolveRoomMemberForGame(supabase, code, memberCode)
  if (!member) return NextResponse.json({ error: 'Room member not found for this game' }, { status: 404 })

  return NextResponse.json({ memberId: member.id, displayName: member.display_name })
}
