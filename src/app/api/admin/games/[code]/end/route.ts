import { NextRequest, NextResponse } from 'next/server'
import { assertAdminRequest } from '@/lib/admin-api'
import { adminEndGame } from '@/lib/admin-end-game'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  const gameId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('id, status, game_type').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  const { error } = await adminEndGame(supabase, game)
  if (error) {
    const status = error === 'Only waiting or active games can be ended' ? 400 : 500
    return NextResponse.json({ error }, { status })
  }

  return NextResponse.json({ success: true })
}
