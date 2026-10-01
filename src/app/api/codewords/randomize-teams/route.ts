import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import { lobbyReady, persistRandomizedRoles, teamsNeedRandomization } from '@/lib/codewords'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertHostAny } from '@/lib/game-admin'

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

  // 404/403 only: the game-TYPE gate below has to stay AHEAD of the status gate, so the
  // status-gated wrappers can't be used here without changing which 400 a caller sees.
  const {
    game,
    error: authError,
    status: authStatus,
  } = await assertHostAny(supabase, code, hostToken, {
    columns: 'game_type, codewords_randomize_teams',
  })
  if (!game) return NextResponse.json({ error: authError }, { status: authStatus })
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
