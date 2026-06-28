import { NextRequest, NextResponse } from 'next/server'
import { bingoCallSchema } from '@/lib/validation'
import { parseGameType, isBingoGame } from '@/lib/game-types'
import { isValidBingoNumber, pickRandomUncalledNumber } from '@/lib/bingo'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = bingoCallSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, hostToken, number: rawNumber, random } = parsed.data
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isBingoGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a bingo game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: existingCalled } = await supabase.from('bingo_called_numbers').select('number').eq('game_id', code)

  const called = (existingCalled ?? []).map((row) => row.number)

  let number = rawNumber ?? null
  if (random || number == null) {
    number = pickRandomUncalledNumber(called)
    if (number == null) {
      return NextResponse.json({ error: 'All numbers have been called' }, { status: 400 })
    }
  }

  if (!isValidBingoNumber(number)) {
    return NextResponse.json({ error: 'Invalid bingo number' }, { status: 400 })
  }
  if (called.includes(number)) {
    return NextResponse.json({ error: 'Number already called' }, { status: 400 })
  }

  const { data: inserted, error } = await supabase
    .from('bingo_called_numbers')
    .insert({ game_id: code, number })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, called: inserted })
}
