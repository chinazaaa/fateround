import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateGameCode, generateToken } from '@/lib/utils'
import { createTournamentSchema } from '@/lib/tournament-validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = createTournamentSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { title, placementPoints, targetGameCount } = parsed.data
  const hostToken = generateToken()

  let tournamentCode = ''
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateGameCode()
    const { data: existing } = await supabase.from('tournaments').select('id').eq('id', candidate).maybeSingle()
    if (!existing) {
      tournamentCode = candidate
      break
    }
  }

  if (!tournamentCode) {
    return NextResponse.json({ error: 'Failed to generate unique code' }, { status: 500 })
  }

  const { error } = await supabase.from('tournaments').insert({
    id: tournamentCode,
    host_token: hostToken,
    title,
    placement_points: placementPoints ?? [10, 7, 5, 3, 2, 1],
    target_game_count: targetGameCount ?? null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tournamentCode, hostToken })
}
