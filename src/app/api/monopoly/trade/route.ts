import { NextRequest, NextResponse } from 'next/server'
import { isMonopolyGame, parseGameType } from '@/lib/game-types'
import {
  processMonopolyTradeCancel,
  processMonopolyTradePropose,
  processMonopolyTradeRespond,
  repairMonopolyStalePendingTrade,
} from '@/lib/monopoly'
import {
  monopolyTradeCancelSchema,
  monopolyTradeProposeSchema,
  monopolyTradeRepairSchema,
  monopolyTradeRespondSchema,
} from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertPlayer } from '@/lib/game-admin'

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const code = String(raw.gameId ?? '').toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })
  if (!isMonopolyGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Monopoly game' }, { status: 400 })
  }

  if (raw.repair === true) {
    const parsed = monopolyTradeRepairSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    // Authorize by the secret resume_token (any player in the game may trigger repair).
    const auth = await assertPlayer(supabase, code, parsed.data.resumeToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    await repairMonopolyStalePendingTrade(supabase, code)
    return NextResponse.json({ success: true })
  }

  if (raw.cancel === true) {
    const parsed = monopolyTradeCancelSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    // Authorize by the secret resume_token; the resolved player.id is authoritative.
    const auth = await assertPlayer(supabase, code, parsed.data.resumeToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { error } = await processMonopolyTradeCancel(supabase, code, auth.player.id)
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  await repairMonopolyStalePendingTrade(supabase, code)

  if (raw.accept !== undefined) {
    const parsed = monopolyTradeRespondSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    // Authorize by the secret resume_token; the resolved player.id is authoritative.
    const auth = await assertPlayer(supabase, code, parsed.data.resumeToken)
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const { accept } = parsed.data
    const { error } = await processMonopolyTradeRespond(supabase, code, auth.player.id, accept)
    if (error) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  const parsed = monopolyTradeProposeSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  // Authorize by the secret resume_token; the resolved player.id is authoritative.
  const auth = await assertPlayer(supabase, code, parsed.data.resumeToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const {
    toPlayerId,
    offerCash,
    offerProperties,
    offerGetOutCards,
    requestCash,
    requestProperties,
    requestGetOutCards,
  } = parsed.data
  const { error } = await processMonopolyTradePropose(
    supabase,
    code,
    auth.player.id,
    toPlayerId,
    {
      cash: offerCash,
      properties: offerProperties,
      getOutCards: offerGetOutCards,
    },
    {
      cash: requestCash,
      properties: requestProperties,
      getOutCards: requestGetOutCards,
    }
  )
  if (error) return NextResponse.json({ error }, { status: 400 })

  return NextResponse.json({ success: true })
}
