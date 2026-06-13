import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hostActionSchema } from '@/lib/validation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = hostActionSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken } = parsed.data
  const gameId = code.toUpperCase()

  const { data: game } = await supabase.from('games').select('*').eq('id', gameId).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (game.status !== 'finished') {
    return NextResponse.json({ error: 'Game must be finished before playing again' }, { status: 400 })
  }

  const { error: votesError } = await supabase.from('votes').delete().eq('game_id', gameId)
  if (votesError) return NextResponse.json({ error: votesError.message }, { status: 500 })

  const { error: confessionsError } = await supabase.from('confessions').delete().eq('game_id', gameId)
  if (confessionsError) return NextResponse.json({ error: confessionsError.message }, { status: 500 })

  const { error: roundsError } = await supabase.from('rounds').delete().eq('game_id', gameId)
  if (roundsError) return NextResponse.json({ error: roundsError.message }, { status: 500 })

  const { error: poolError } = await supabase.from('wst_quote_pool').delete().eq('game_id', gameId)
  if (poolError) return NextResponse.json({ error: poolError.message }, { status: 500 })

  const { data: updated, error: gameError } = await supabase
    .from('games')
    .update({ status: 'waiting', current_round_number: 0 })
    .eq('id', gameId)
    .select()
    .single()

  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

  return NextResponse.json({ success: true, game: updated })
}
