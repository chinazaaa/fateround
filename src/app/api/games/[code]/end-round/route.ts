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
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: activeRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('game_id', gameId)
    .eq('status', 'active')
    .maybeSingle()

  if (!activeRound) {
    return NextResponse.json({ error: 'No active round to end' }, { status: 400 })
  }

  const now = new Date().toISOString()

  await supabase
    .from('rounds')
    .update({ status: 'finished', ended_at: now })
    .eq('id', activeRound.id)

  const isLastRound = activeRound.round_number >= game.rounds_count
  return NextResponse.json({
    finished: true,
    isLastRound,
    roundNumber: activeRound.round_number,
  })
}
