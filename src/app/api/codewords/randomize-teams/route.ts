import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { lobbyReady, persistRandomizedRoles, teamsNeedRandomization } from '@/lib/codewords'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'

const schema = z.object({
  gameId: z.string().min(4).max(10),
  hostToken: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, schema)
  if (bodyError) return bodyError

  const { gameId, hostToken } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  const { data: game } = await supabase
    .from('games')
    .select('host_token, game_type, status, codewords_randomize_teams')
    .eq('id', code)
    .maybeSingle()

  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.host_token !== hostToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (game.status !== 'waiting') {
    return NextResponse.json({ error: 'Teams can only be shuffled in the lobby' }, { status: 400 })
  }
  if (!game.codewords_randomize_teams) {
    return NextResponse.json({ error: 'This game does not use randomized teams' }, { status: 400 })
  }

  const [{ data: players }, { data: roleRows }] = await Promise.all([
    supabase.from('players').select('id').eq('game_id', code),
    supabase.from('codewords_player_roles').select('player_id, team, role').eq('game_id', code),
  ])

  const playerIds = (players ?? []).map((p) => p.id)
  const roles = roleRows ?? []

  if (!teamsNeedRandomization(playerIds, roles)) {
    const ready = lobbyReady(roles)
    if (ready.ok) {
      return NextResponse.json({ success: true, roles, alreadyShuffled: true })
    }
  }

  const { roles: nextRoles, error } = await persistRandomizedRoles(supabase, code, playerIds, roles)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const ready = lobbyReady(nextRoles)
  if (!ready.ok) {
    return NextResponse.json({ error: ready.error ?? 'Teams are not ready after shuffle' }, { status: 400 })
  }

  return NextResponse.json({ success: true, roles: nextRoles })
}
