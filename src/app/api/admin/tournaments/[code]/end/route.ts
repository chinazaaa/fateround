import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await assertAdminRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await params
  const tournamentId = code.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, status')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: 'Tournament already finished' }, { status: 400 })
  }

  // Close any in-progress match rows, then mark the tournament finished — mirrors
  // the host-facing finish action.
  await supabase
    .from('tournament_games')
    .update({ status: 'finished' })
    .eq('tournament_id', tournamentId)
    .eq('status', 'active')

  const { error } = await supabase.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)
  if (error) {
    return NextResponse.json({ error: internalErrorMessage('admin/tournaments/end', error) }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
