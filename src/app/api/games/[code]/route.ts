import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { assertHostGameSettings } from '@/lib/game-admin'
import { questionPoolCap } from '@/lib/custom-questions'
import { parseTimerSeconds, updateGameSchema } from '@/lib/validation'
import { parseGameType, isHotSeat } from '@/lib/game-types'
import { clampHotSeatMaxCap, HOT_SEAT_MAX_ROUNDS_CAP } from '@/lib/hot-seat'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const raw = await req.json()
  const parsed = updateGameSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { hostToken, rounds_count: rawRoundsCount, timer_seconds: rawTimerSeconds, participant_filter } = parsed.data

  const auth = await assertHostGameSettings(supabase, code, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const updatePayload: Record<string, unknown> = {}

  if (rawRoundsCount !== undefined) {
    const gameType = parseGameType(auth.game!.game_type)
    const cap = isHotSeat(gameType) ? HOT_SEAT_MAX_ROUNDS_CAP : questionPoolCap(auth.game!)
    const min = isHotSeat(gameType) ? 3 : 1
    const rounds_count = isHotSeat(gameType)
      ? clampHotSeatMaxCap(rawRoundsCount)
      : Math.min(Math.max(rawRoundsCount, min), cap)
    if (!isHotSeat(gameType) && rawRoundsCount > cap) {
      return NextResponse.json({ error: `Too many rounds — pick ${cap} or fewer` }, { status: 400 })
    }
    updatePayload.rounds_count = rounds_count
  }

  if (rawTimerSeconds !== undefined) {
    updatePayload.timer_seconds = parseTimerSeconds(rawTimerSeconds)
  }

  if (participant_filter !== undefined) {
    updatePayload.participant_filter = participant_filter === 'joined' ? 'joined' : 'all'
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: game, error } = await supabase.from('games').update(updatePayload).eq('id', auth.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ game })
}
