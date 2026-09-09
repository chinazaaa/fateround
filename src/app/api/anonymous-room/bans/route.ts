import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { anonymousRoomBanSchema, anonymousRoomUnbanSchema } from '@/lib/validation'
import { parseJsonBody } from '@/lib/parse-body'
import { parseGameType, isAnonymousMessagesGame } from '@/lib/game-types'
import { isPlayerBanned } from '@/lib/anonymous-messages'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { assertHostAny } from '@/lib/game-admin'

const supabase = getSupabaseAnon()

// The 404/403 half of this ladder is the shared one (`assertHostAny`); the two 400s stay
// here because their ORDER is this route's own — the game-type check runs BEFORE the status
// check, so a finished non-anonymous game answers "Not an anonymous room". Routing the status
// gate through `assertHostWith` would flip that pair and change the reply.
async function assertHostAnonymousRoom(gameCode: string, hostToken: string) {
  const auth = await assertHostAny(getSupabaseAdmin(), gameCode, hostToken)
  if (auth.error) return auth
  const { game, id } = auth
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
  const { data: body, error: bodyError } = await parseJsonBody(req, anonymousRoomBanSchema)
  if (bodyError) return bodyError

  const { gameId, playerId, hostToken, durationMinutes } = body
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

  if (error) return NextResponse.json({ error: internalErrorMessage('anonymous-room/bans', error) }, { status: 500 })

  return NextResponse.json({ success: true, ban })
}

export async function DELETE(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, anonymousRoomUnbanSchema)
  if (bodyError) return bodyError

  const { gameId, playerId, hostToken } = body
  const auth = await assertHostAnonymousRoom(gameId, hostToken)
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabaseAdmin = getSupabaseAdmin()
  const { error } = await supabaseAdmin
    .from('anonymous_room_bans')
    .delete()
    .eq('game_id', auth.id)
    .eq('player_id', playerId)

  if (error) return NextResponse.json({ error: internalErrorMessage('anonymous-room/bans', error) }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function GET(req: NextRequest) {
  const gameId = req.nextUrl.searchParams.get('gameId')?.toUpperCase()
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })

  const { data: bans, error } = await supabase.from('anonymous_room_bans').select('*').eq('game_id', gameId)

  if (error) return NextResponse.json({ error: internalErrorMessage('anonymous-room/bans', error) }, { status: 500 })

  const active = (bans ?? []).filter((ban) => isPlayerBanned(ban.banned_until))
  return NextResponse.json({ bans: active })
}
