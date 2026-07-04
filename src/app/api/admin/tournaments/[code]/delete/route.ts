import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  const tournamentId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: tournament } = await supabase.from('tournaments').select('id').eq('id', tournamentId).maybeSingle()
  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })

  // games.tournament_id references tournaments(id) with no ON DELETE action, so the
  // tournament can't be removed while games still point at it. Detach those game
  // rooms (they remain independently listed/deletable) rather than deleting them.
  const { error: detachError } = await supabase
    .from('games')
    .update({ tournament_id: null })
    .eq('tournament_id', tournamentId)
  if (detachError) {
    return NextResponse.json({ error: internalErrorMessage('admin/tournaments/delete', detachError) }, { status: 500 })
  }

  // tournament_players and tournament_games reference tournaments(id) ON DELETE
  // CASCADE, so removing the row also clears the bracket and roster.
  const { error } = await supabase.from('tournaments').delete().eq('id', tournamentId)
  if (error) {
    return NextResponse.json({ error: internalErrorMessage('admin/tournaments/delete', error) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
