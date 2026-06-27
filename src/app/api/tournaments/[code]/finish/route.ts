import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { tournamentHostActionSchema } from '@/lib/tournament-validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const raw = await req.json()
  const parsed = tournamentHostActionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken } = parsed.data

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('host_token, status')
    .eq('id', tournamentId)
    .maybeSingle()

  if (!tournament) {
    return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  }
  if (tournament.host_token !== hostToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  if (tournament.status === 'finished') {
    return NextResponse.json({ error: 'Tournament already finished' }, { status: 400 })
  }

  await supabase
    .from('tournament_games')
    .update({ status: 'finished' })
    .eq('tournament_id', tournamentId)
    .eq('status', 'active')

  const { error } = await supabase.from('tournaments').update({ status: 'finished' }).eq('id', tournamentId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
