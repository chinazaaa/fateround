import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anonymousRoomBanSchema, anonymousRoomUnbanSchema } from '@/lib/validation'
import { parseGameType, isAnonymousMessagesGame } from '@/lib/game-types'
import { isPlayerBanned } from '@/lib/anonymous-messages'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

async function assertHostAnonymousRoom(gameCode: string, hostToken: string) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase.from('games').select('*').eq('id', id).maybeSingle()
  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }
  if (game.host_token !== hostToken) return { error: 'Unauthorized', status: 403 as const, game: null, id }
  if (!isAnonymousMessagesGame(parseGameType(game.game_type))) {
    return { error: 'Not an anonymous room', status: 400 as const, game: null, id }
  }
  if (game.status !== 'waiting' && game.status !== 'active') {
    return {
      error: 'Players can only be muted during the lobby or an active session',
      status: 400 as const,
      game: null,
      id,
    }
  }
  return { error: null, status: 200 as const, game, id }
}

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = anonymousRoomBanSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, hostToken, durationMinutes } = parsed.data
  const auth = await assertHostAnonymousRoom(gameId, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('game_id', auth.id)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const bannedUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()

  const supabaseAdmin = getSupabaseAdmin()
  const { data: ban, error } = await supabaseAdmin
    .from('anonymous_room_bans')
    .upsert(
      {
        game_id: auth.id,
        player_id: playerId,
        banned_until: bannedUntil,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'game_id,player_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, ban })
}

export async function DELETE(req: NextRequest) {
  const raw = await req.json()
  const parsed = anonymousRoomUnbanSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const { gameId, playerId, hostToken } = parsed.data
  const auth = await assertHostAnonymousRoom(gameId, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('anonymous_room_bans')
    .delete()
    .eq('game_id', auth.id)
    .eq('player_id', playerId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get('gameId')?.toUpperCase()
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })

  const { data: bans, error } = await supabase.from('anonymous_room_bans').select('*').eq('game_id', gameId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const active = (bans ?? []).filter((ban) => isPlayerBanned(ban.banned_until))
  return NextResponse.json({ bans: active })
}
