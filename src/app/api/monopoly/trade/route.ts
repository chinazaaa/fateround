import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isMonopolyGame, parseGameType } from '@/lib/game-types'
import { processMonopolyTradePropose, processMonopolyTradeRespond } from '@/lib/monopoly'
import { monopolyTradeProposeSchema, monopolyTradeRespondSchema } from '@/lib/validation'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const code = String(raw.gameId ?? '').toUpperCase()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isMonopolyGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Monopoly game' }, { status: 400 })
  }

  if (raw.accept !== undefined) {
    const parsed = monopolyTradeRespondSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    const { playerId, accept } = parsed.data
    const { error } = await processMonopolyTradeRespond(supabase, code, playerId, accept)
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  const parsed = monopolyTradeProposeSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { playerId, toPlayerId, offerCash, offerProperties, offerGetOutCards, requestCash, requestProperties } =
    parsed.data
  const { error } = await processMonopolyTradePropose(supabase, code, playerId, toPlayerId, {
    cash: offerCash,
    properties: offerProperties,
    getOutCards: offerGetOutCards,
  }, {
    cash: requestCash,
    properties: requestProperties,
  })
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
