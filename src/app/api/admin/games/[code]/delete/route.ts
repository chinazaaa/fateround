import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  const gameId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('id').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })

  // All game-scoped tables reference games(id) ON DELETE CASCADE, so removing the
  // row also removes its rounds, players, and game-specific state.
  const { error } = await supabase.from('games').delete().eq('id', gameId)
  if (error) return NextResponse.json({ error: internalErrorMessage('admin/games/delete', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}
