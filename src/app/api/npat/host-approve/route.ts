import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { approveNpatRound } from '@/lib/npat-advance'
import { isNamePlaceAnimalThingGame, parseGameType } from '@/lib/game-types'
import { NPAT_CATEGORIES, parseNpatMetadata } from '@/lib/npat'
import { npatHostApproveSchema } from '@/lib/validation'
import type { NpatMetadata } from '@/types'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = npatHostApproveSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, hostToken, roundId, overrides } = parsed.data
  const code = gameId.toUpperCase()

  const { data: game } = await supabase.from('games').select('*').eq('id', code).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isNamePlaceAnimalThingGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a Name Place Animal Thing game' }, { status: 400 })
  }
  if (game.status !== 'active') return NextResponse.json({ error: 'Game not active' }, { status: 400 })

  const { data: round } = await supabase.from('rounds').select('*').eq('id', roundId).eq('game_id', code).maybeSingle()
  if (!round || round.status !== 'active') {
    return NextResponse.json({ error: 'Round is not active' }, { status: 400 })
  }

  const metadata = parseNpatMetadata(round.npat_metadata)
  if (!metadata || metadata.phase !== 'host_review') {
    return NextResponse.json({ error: 'Round is not awaiting host approval' }, { status: 400 })
  }

  const hostOverrides: NonNullable<NpatMetadata['host_overrides']> = {}
  for (const row of overrides) {
    hostOverrides[row.playerId] = {
      name: row.validName,
      animal: row.validAnimal,
      place: row.validPlace,
      thing: row.validThing,
    }
  }

  for (const playerId of Object.keys(hostOverrides)) {
    const entry = hostOverrides[playerId]
    if (!entry) continue
    for (const category of NPAT_CATEGORIES) {
      if (typeof entry[category] !== 'boolean') {
        return NextResponse.json({ error: 'Missing validity for a player category' }, { status: 400 })
      }
    }
  }

  const ok = await approveNpatRound(supabase, code, roundId, hostOverrides)
  if (!ok) return NextResponse.json({ error: 'Failed to approve round' }, { status: 500 })

  return NextResponse.json({ success: true })
}
