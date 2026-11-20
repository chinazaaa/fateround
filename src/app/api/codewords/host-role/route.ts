import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { z } from 'zod'
import { parseGameType, isCodewordsGame } from '@/lib/game-types'
import {
  codewordsAllowsPlayerChanges,
  isSpymasterSeatConflict,
  reconcileCodewordsTeamAfterRemoval,
  reconcileCodewordsAllTeams,
  removeCodewordsPlayerRole,
} from '@/lib/codewords'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertHostAny } from '@/lib/game-admin'

const hostRoleSchema = z.object({
  gameId: z.string().min(4).max(10),
  hostToken: z.string().min(1),
  playerId: z.string().uuid(),
  team: z.enum(['red', 'blue']),
  role: z.enum(['spymaster', 'operative']),
})

const hostUnassignSchema = z.object({
  gameId: z.string().min(4).max(10),
  hostToken: z.string().min(1),
  playerId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, hostRoleSchema)
  if (bodyError) return bodyError

  const { gameId, hostToken, playerId, team, role } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  // 404/403 only: the game-TYPE gate below has to stay AHEAD of the status gate, so the
  // status-gated wrappers can't be used here without changing which 400 a caller sees.
  const {
    game,
    error: authError,
    status: authStatus,
  } = await assertHostAny(supabase, code, hostToken, { columns: 'game_type' })
  if (!game) return NextResponse.json({ error: authError }, { status: authStatus })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (!codewordsAllowsPlayerChanges(game.status)) {
    return NextResponse.json({ error: 'Teams can only be changed while the lobby or game is open' }, { status: 400 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('game_id', code)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  if (role === 'spymaster') {
    const { data: existing } = await supabase
      .from('codewords_player_roles')
      .select('player_id')
      .eq('game_id', code)
      .eq('team', team)
      .eq('role', 'spymaster')
      .maybeSingle()

    if (existing && existing.player_id !== playerId) {
      await supabase
        .from('codewords_player_roles')
        .update({ role: 'operative' })
        .eq('game_id', code)
        .eq('player_id', existing.player_id)
    }
  }

  const { data: roleRow, error } = await supabase
    .from('codewords_player_roles')
    .upsert({ game_id: code, player_id: playerId, team, role }, { onConflict: 'game_id,player_id' })
    .select()
    .single()

  if (error) {
    // Two host requests can both see an empty spymaster seat and skip the demotion; the partial
    // unique index rejects the second upsert. Same answer as a sequential refusal, not a 500.
    if (role === 'spymaster' && isSpymasterSeatConflict(error)) {
      return NextResponse.json(
        { error: `${team === 'red' ? 'Red' : 'Blue'} team already has a spymaster` },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: internalErrorMessage('codewords/host-role', error) }, { status: 500 })
  }
  return NextResponse.json({ success: true, role: roleRow })
}

export async function DELETE(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, hostUnassignSchema)
  if (bodyError) return bodyError

  const { gameId, hostToken, playerId } = body
  const code = gameId.toUpperCase()
  const supabase = getSupabaseAdmin()

  // 404/403 only: the game-TYPE gate below has to stay AHEAD of the status gate, so the
  // status-gated wrappers can't be used here without changing which 400 a caller sees.
  const {
    game,
    error: authError,
    status: authStatus,
  } = await assertHostAny(supabase, code, hostToken, { columns: 'game_type' })
  if (!game) return NextResponse.json({ error: authError }, { status: authStatus })
  if (!isCodewordsGame(parseGameType(game.game_type))) {
    return NextResponse.json({ error: 'Not a codewords game' }, { status: 400 })
  }
  if (!codewordsAllowsPlayerChanges(game.status)) {
    return NextResponse.json({ error: 'Players can only be moved while the lobby or game is open' }, { status: 400 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('game_id', code)
    .maybeSingle()
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const { data: role } = await supabase
    .from('codewords_player_roles')
    .select('id, team')
    .eq('game_id', code)
    .eq('player_id', playerId)
    .maybeSingle()
  if (!role) {
    // A repeat of a removal whose reconciliation gave up ("try again") lands here: the role is
    // already gone, so the team it left can no longer be read from the request. Reconcile every
    // team (idempotent; a no-op for a healthy roster) so the retry can finish the repair.
    const repair = await reconcileCodewordsAllTeams(supabase, code)
    if (repair.error) return NextResponse.json({ error: repair.error }, { status: 500 })
    if (repair.outcome.ended || repair.outcome.promotedPlayerId) {
      return NextResponse.json({ success: true, ...repair.outcome })
    }
    return NextResponse.json({ error: 'Player is not on a team' }, { status: 400 })
  }

  const { error } = await removeCodewordsPlayerRole(supabase, code, playerId)
  if (error) return NextResponse.json({ error }, { status: 500 })

  // Benching mid-round can strip a team of its spymaster/operative — end or repair.
  const { error: reconcileError, outcome } = await reconcileCodewordsTeamAfterRemoval(
    supabase,
    code,
    (role.team as 'red' | 'blue' | undefined) ?? null
  )
  if (reconcileError) return NextResponse.json({ error: reconcileError }, { status: 500 })

  return NextResponse.json({ success: true, ...outcome })
}
