import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { joinTournamentSchema } from '@/lib/tournament-validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

const JOIN_ERRORS: Record<string, { message: string; status: number }> = {
  not_found: { message: 'Tournament not found', status: 404 },
  ended: { message: 'Tournament has ended', status: 400 },
  eliminated: { message: 'You have been eliminated from this tournament', status: 403 },
  name_taken: { message: 'Name already taken', status: 409 },
  full: { message: 'Tournament is full', status: 409 },
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const tournamentId = code.toUpperCase()

  const raw = await req.json()
  const parsed = joinTournamentSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { playerName } = parsed.data

  // Atomic join: the RPC locks the tournament row and checks name + capacity
  // before inserting, so concurrent joins can't exceed max_players. Initializing
  // lives also happens inside the same transaction.
  const { data, error } = await supabase.rpc('join_tournament', {
    p_tournament_id: tournamentId,
    p_player_name: playerName,
  })

  // Fail closed — never treat a DB error as "there's room".
  if (error) {
    return NextResponse.json({ error: 'Failed to join' }, { status: 500 })
  }

  const result = (data ?? {}) as { error?: string; player?: unknown }
  if (result.error) {
    const mapped = JOIN_ERRORS[result.error] ?? { message: 'Failed to join', status: 400 }
    return NextResponse.json({ error: mapped.message }, { status: mapped.status })
  }

  return NextResponse.json({ player: result.player })
}
